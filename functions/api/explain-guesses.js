// Cloudflare Pages serverless API function to explain why incorrect guesses are wrong
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    
    // Parse request body
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON request body." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { correctDiagnosis, incorrectGuesses } = body;

    if (!correctDiagnosis || !incorrectGuesses || !Array.isArray(incorrectGuesses)) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: correctDiagnosis and incorrectGuesses (array)." }),
        { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        }
      );
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

    // Filter out 'Skipped' or empty guesses to only explain actual wrong guesses
    const actualWrongGuesses = incorrectGuesses.filter(g => g && g.toLowerCase() !== 'skipped');

    let prompt = "";
    if (actualWrongGuesses.length === 0) {
      prompt = `You are an elite clinical medicine educator.
A medical student playing a diagnosis guessing game correctly identified today's case as **${correctDiagnosis}**.
Since they correctly identified the diagnosis without making wrong guesses, provide a brief, high-yield clinical review and study summary of **${correctDiagnosis}**.
Include:
1. **Key Presentation**: Classic signs, symptoms, and risk factors.
2. **Diagnostics**: Gold-standard diagnostic tests, key labs, or pathognomonic findings.
3. **First-line Management**: Basic therapeutics and key educational points for board exams.

Use a concise, educational, and bulleted format suitable for USMLE Step 1 and Step 2 clinical review.
Keep it compact, clean, and format it in easy-to-read HTML (e.g., using <ul>, <li>, and <strong> tags). Do not return markdown block quotes or full page HTML.`;
    } else {
      prompt = `You are an elite clinical medicine educator.
A medical student playing a diagnosis guessing game correctly identified today's case as **${correctDiagnosis}**.
However, during their attempts, they made the following incorrect diagnoses:
${actualWrongGuesses.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Briefly explain why each incorrect guess is wrong and how it clinically differentiates from the correct diagnosis (**${correctDiagnosis}**).
Use a concise, educational, and bulleted format suitable for high-yield USMLE Step 1 and Step 2 clinical review.
Keep it compact, clean, and format it in easy-to-read HTML (e.g., using <ul>, <li>, and <strong> tags). Do not return markdown block quotes or full page HTML.`;
    }

    const models = [
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ];

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    let result = null;
    let lastError = null;

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const apiResponse = await fetch(url, {
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

    return new Response(JSON.stringify({ explanation: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred during explanation generation." }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}
