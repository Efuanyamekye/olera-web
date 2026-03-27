import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are helping a senior care provider reach out to a family looking for care. Write a warm, professional, concise message (3–4 short paragraphs max). Use the family's first name. Reference their care needs if known. End with a clear, low-pressure call to action. Sign off with the provider's facility name. Never mention specific prices or guarantees.`;

interface GenerateMessageRequest {
  familyFirstName: string;
  careTypes?: string[];
  timeline?: string;
  whoNeedsCare?: string;
  tone: "introduce" | "ask_needs" | "invite_visit";
  providerName: string;
  providerLocation?: string;
  profileState: "full" | "partial" | "minimal";
}

function buildUserPrompt(data: GenerateMessageRequest): string {
  const {
    familyFirstName,
    careTypes = [],
    timeline,
    whoNeedsCare,
    tone,
    providerName,
    providerLocation,
    profileState,
  } = data;

  let prompt = `Generate a reach-out message for a senior care provider.\n\n`;
  prompt += `Family's first name: ${familyFirstName}\n`;
  prompt += `Provider name: ${providerName}\n`;

  if (providerLocation) {
    prompt += `Provider location: ${providerLocation}\n`;
  }

  if (careTypes.length > 0) {
    prompt += `Care types they're looking for: ${careTypes.join(", ")}\n`;
  }

  if (timeline) {
    const timelineLabels: Record<string, string> = {
      as_soon_as_possible: "immediately",
      within_a_month: "within a month",
      in_a_few_months: "in a few months",
      just_researching: "just researching options",
      immediate: "immediately",
      within_1_month: "within a month",
      within_3_months: "within 3 months",
      exploring: "exploring options",
    };
    prompt += `Timeline: They need care ${timelineLabels[timeline] || timeline}\n`;
  }

  if (whoNeedsCare) {
    const careLabels: Record<string, string> = {
      myself: "themselves",
      my_parent: "their parent",
      my_spouse: "their spouse",
      someone_else: "someone they care about",
    };
    prompt += `Who needs care: ${careLabels[whoNeedsCare] || whoNeedsCare}\n`;
  }

  prompt += `\nProfile completeness: ${profileState}\n`;

  // Tone instructions
  switch (tone) {
    case "introduce":
      prompt += `\nTone: Warm introduction. Introduce the provider and express interest in helping. Keep it friendly and professional.`;
      break;
    case "ask_needs":
      prompt += `\nTone: Curious and caring. Focus on asking about their specific needs and situation. Show genuine interest in understanding what they're looking for.`;
      break;
    case "invite_visit":
      prompt += `\nTone: Inviting and welcoming. Extend an invitation to visit or tour the facility. Make it feel low-pressure but enthusiastic.`;
      break;
  }

  // Profile state instructions
  if (profileState === "minimal") {
    prompt += `\n\nIMPORTANT: This family has a minimal profile with limited information. Write a very warm, gentle message that doesn't assume too much about their needs. Focus on being welcoming and available without being pushy.`;
  } else if (profileState === "partial") {
    prompt += `\n\nNote: This family's profile is partially complete. Be warm and open-ended, inviting them to share more about their situation.`;
  } else {
    prompt += `\n\nNote: This family has a complete profile. You can reference their specific care needs in the message.`;
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const data = (await request.json()) as GenerateMessageRequest;

    // Validate required fields
    if (!data.familyFirstName || !data.providerName || !data.tone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const userPrompt = buildUserPrompt(data);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract the text content from the response
    const textContent = response.content.find((block) => block.type === "text");
    const message = textContent?.type === "text" ? textContent.text : "";

    return NextResponse.json({ message });
  } catch (error) {
    console.error("[generate-message] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate message" },
      { status: 500 }
    );
  }
}
