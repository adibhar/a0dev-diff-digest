import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { diff } = await req.json();

    if (!diff) {
      return NextResponse.json({ error: "Missing diff" }, { status: 400 });
    }

    // chat prompt
    const prompt = `
Given the following Git diff, create two sections:

1. Developer Notes:
-  Explain all tech changes
-  Mention critical details like bug fixes, any optimizations, or code refactors
-  Be to-the-point and concise
-  Highlight any key tech changes

2. Marketing Notes:
- Describe how the user experience changes from the fixes
- Use language that is easy to read (non-technical)
- Highlight any changes that would be directly visible to a user

--- 
Git Diff:
${diff}
`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", //should be the best model for this
        stream: true,
        messages: [
          {
            role: "system",
            content: "You generate high-quality release notes based on Git diffs, with Developer and Product/Business sections.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    return new Response(openaiResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
      },
    });

  } catch (error) {
    console.error("Error in /api/notes-generator:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
