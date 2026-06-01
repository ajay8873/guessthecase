// Cloudflare Pages serverless API function to generate 10 clinical cases via Gemini AI
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    
    // Parse request body for fallback credentials
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      // Empty body or not JSON
    }

    // Determine the API Key (env first, then request header x-api-key, then request body parameter)
    const apiKey = env.GEMINI_API_KEY || 
                   request.headers.get("x-api-key") || 
                   body.apiKey || 
                   "";

    const supabaseUrl = env.SUPABASE_URL || request.headers.get("x-supabase-url") || body.supabaseUrl || "";
    const supabaseKey = env.SUPABASE_ANON_KEY || request.headers.get("x-supabase-key") || body.supabaseKey || "";
    const subject = body.subject || "General Medicine";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing Gemini API Key. Please configure it in your Cloudflare dashboard environment variables or pass it locally." }),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        }
      );
    }

    let existingCasesContext = "";
    if (supabaseUrl && supabaseKey) {
      try {
        const sbResponse = await fetch(`${supabaseUrl}/rest/v1/cases?select=name`, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`
          }
        });
        if (sbResponse.ok) {
          const cases = await sbResponse.json();
          if (cases && cases.length > 0) {
            const caseNames = cases.map(c => c.name).join(", ");
            existingCasesContext = `\nCRITICAL INSTRUCTION: Do NOT generate any of the following conditions as they already exist in our database: ${caseNames}.`;
          }
        }
      } catch (e) {
        console.error("Failed to fetch existing cases from Supabase", e);
      }
    }

    const prompt = `Generate 10 realistic, challenging medical clinical cases for a medical education guessing game.
All 10 cases MUST belong to the medical specialty (subject): ${subject}.
Each case must have a distinct correct diagnosis. Avoid duplicating common conditions.${existingCasesContext}
Focus on classic clinical presentations suitable for USMLE Step 1 and Step 2 preparation.
For each case, generate:
1. 'name': The standard correct diagnosis (e.g., 'Acute Appendicitis').
2. 'synonyms': Array of 2-4 alternative terms (e.g., ['Appendicitis', 'Inflammation of appendix']).
3. 'initialClue': A brief clinical vignette representing the patient's chief complaint, age, gender, and history (e.g., 'A 24-year-old male presents with acute navel pain...').
4. 'symptoms': An array of EXACTLY 5 progressively revealing diagnostic clues:
   - Clue 1 (index 0): Physical exam findings or early course.
   - Clue 2 (index 1): A characteristic clinical sign or eponym.
   - Clue 3 (index 2): Standard diagnostic test or imaging findings.
   - Clue 4 (index 3): Labs, serum markers, or antibody values.
   - Clue 5 (index 4): Pathological hallmark, histopathology, or pre-op surgical requirements.
5. 'description': A detailed clinical summary of the condition, its pathophysiology, and classic treatment.
6. 'anki1': Anki tag format (e.g., 'Medical::Surgery::Appendicitis').
7. 'anki2': Step 2 tag format (e.g., 'Step2::Surgery::GI').
8. 'nejmLink': A Google search query link for the case report (e.g., 'https://www.google.com/search?q=NEJM+case+report+Acute+Appendicitis').
9. 'subject': The exact string "${subject}".`;

    // Fallback model list in order of preference
    const models = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ];

    const schema = {
      type: "OBJECT",
      properties: {
        cases: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              synonyms: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              initialClue: { type: "STRING" },
              symptoms: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              description: { type: "STRING" },
              anki1: { type: "STRING" },
              anki2: { type: "STRING" },
              nejmLink: { type: "STRING" },
              subject: { type: "STRING" }
            },
            required: ["name", "synonyms", "initialClue", "symptoms", "description", "anki1", "anki2", "nejmLink", "subject"]
          }
        }
      },
      required: ["cases"]
    };

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    };

    let apiResponse = null;
    let result = null;
    let lastError = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      apiResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (apiResponse.ok) {
        result = await apiResponse.json();
        break;
      }

      const errData = await apiResponse.json();
      lastError = errData.error?.message || `Model ${model} failed.`;

      // Only retry on overload/rate-limit errors (503, 429)
      if (apiResponse.status !== 503 && apiResponse.status !== 429) {
        throw new Error(lastError);
      }
    }

    if (!result) {
      throw new Error(lastError || "All models are currently unavailable. Please try again later.");
    }
    
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts || !result.candidates[0].content.parts[0].text) {
      throw new Error("Invalid response format received from Gemini AI.");
    }

    const text = result.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(text);

    // Save generated cases to Supabase
    if (supabaseUrl && supabaseKey && parsedData.cases && parsedData.cases.length > 0) {
      try {
        // Format the cases to match snake_case schema expected by Supabase
        const dbCases = parsedData.cases.map(c => ({
          name: c.name,
          synonyms: c.synonyms,
          initial_clue: c.initialClue,
          symptoms: c.symptoms,
          description: c.description,
          anki1: c.anki1,
          anki2: c.anki2,
          nejm_link: c.nejmLink,
          subject: c.subject || subject
        }));

        await fetch(`${supabaseUrl}/rest/v1/cases`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(dbCases)
        });
      } catch (e) {
        console.error("Failed to save cases to Supabase", e);
      }
    }

    return new Response(JSON.stringify(parsedData.cases), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred during case generation." }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}
