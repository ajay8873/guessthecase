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

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing Gemini API Key. Please configure it in your Cloudflare dashboard environment variables or pass it locally." }),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        }
      );
    }

    const prompt = `Generate 10 realistic, challenging medical clinical cases for a medical education guessing game.
Each case must have a distinct correct diagnosis. Avoid duplicating common conditions.
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
8. 'nejmLink': A Google search query link for the case report (e.g., 'https://www.google.com/search?q=NEJM+case+report+Acute+Appendicitis').`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
              nejmLink: { type: "STRING" }
            },
            required: ["name", "synonyms", "initialClue", "symptoms", "description", "anki1", "anki2", "nejmLink"]
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

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errData = await apiResponse.json();
      throw new Error(errData.error?.message || "Failed to generate cases from Gemini.");
    }

    const result = await apiResponse.json();
    
    if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts || !result.candidates[0].content.parts[0].text) {
      throw new Error("Invalid response format received from Gemini AI.");
    }

    const text = result.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(text);

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
