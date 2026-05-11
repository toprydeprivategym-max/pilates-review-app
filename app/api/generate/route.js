import { NextResponse } from "next/server";
import OpenAI from "openai";
import { QUESTIONS } from "@/lib/questions";

// Node.jsランタイムで動作させる
export const runtime = "nodejs";

const SYSTEM_PROMPT = `あなたはマシンピラティススタジオに通っている会員として、Googleにリアルな口コミを書くプロのライターです。
以下のルールを必ず守ってください:

1. 一人称は「私」「自分」など自然な日本語にする
2. 文字数は180〜380文字程度。Google口コミとして自然な長さに収める
3. ステマっぽい大げさな表現や、AI生成っぽい紋切り型の言い回しは避ける
4. 「★5つです！」「絶対おすすめ！」など過度な称賛は使わない
5. 体験談として自然に読める語り口にする（友人に話すような温度感）
6. ピラティス文脈の言葉（リフォーマー、コア、体幹、骨盤、姿勢、呼吸、コアコントロール 等）を自然に織り交ぜる
7. 医療的な効果効能の断定（"治る""完治"等）は使わない。"和らいだ""楽になった""日常が変わった"等に置き換える
8. 絵文字は使わない
9. 改行は2〜3回程度で読みやすく
10. スタジオ名が指定されていれば、文中で1回だけ自然に触れる（連呼しない）
11. 「自由入力欄」のユーザー自身の言葉は、最も大切な核として必ず反映し、文章の中心に据える
12. ヨガとピラティスは混同しない（呼吸法や瞑想要素を強調しすぎない、コア/動的な側面を中心に）`;

function buildUserPrompt({ answers, freeText, clinicName }) {
  const lines = [];
  lines.push("【今回の会員プロフィール】");
  if (clinicName && clinicName.trim()) {
    lines.push(`スタジオ名: ${clinicName.trim()}`);
  }
  lines.push("");

  for (const q of QUESTIONS) {
    const a = answers?.[q.id];
    if (!a || (Array.isArray(a) && a.length === 0)) continue;
    const valueText = Array.isArray(a) ? a.join("、") : a;
    lines.push(`■ ${q.category} / ${q.label}`);
    lines.push(`  → ${valueText}`);
  }

  lines.push("");
  if (freeText && freeText.trim()) {
    lines.push("【ユーザー本人の言葉（最重要）】");
    lines.push(freeText.trim());
    lines.push("");
    lines.push(
      "上記の本人コメントを口コミの核として、選択肢の情報と自然に組み合わせて、Google口コミに投稿できる文章を1本だけ書いてください。"
    );
  } else {
    lines.push(
      "上記の選択肢情報をもとに、Google口コミに投稿できる文章を1本だけ書いてください。"
    );
  }

  return lines.join("\n");
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { answers = {}, freeText = "", clinicName = "" } = body || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OpenAI APIキーが設定されていません。.env.local にOPENAI_API_KEYを設定してください。",
        },
        { status: 500 }
      );
    }

    const answeredCount = Object.values(answers).filter((v) =>
      Array.isArray(v) ? v.length > 0 : Boolean(v)
    ).length;
    if (answeredCount === 0) {
      return NextResponse.json(
        { error: "質問に1つ以上回答してください。" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const userPrompt = buildUserPrompt({ answers, freeText, clinicName });

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.85,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const review = completion.choices?.[0]?.message?.content?.trim() || "";

    if (!review) {
      return NextResponse.json(
        { error: "口コミの生成に失敗しました。再度お試しください。" },
        { status: 502 }
      );
    }

    return NextResponse.json({ review });
  } catch (err) {
    console.error("[/api/generate] error:", err);
    const message =
      err?.error?.message ||
      err?.message ||
      "予期せぬエラーが発生しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
