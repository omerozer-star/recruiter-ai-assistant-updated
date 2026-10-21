import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePosts } from "@/lib/claude";
import type { JobAnalysis } from "@/lib/types";
import { rateLimited } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const limited = rateLimited("ai:posts");
  if (limited) return limited;
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "המשרה לא נמצאה" }, { status: 404 });
  if (!job.analysis) {
    return NextResponse.json({ error: "למשרה אין עדיין ניתוח AI" }, { status: 400 });
  }

  const analysis = JSON.parse(job.analysis) as JobAnalysis;
  const posts = await generatePosts(
    {
      title: job.title,
      // Discreet jobs: company & location are stripped before the model ever sees them
      company: job.discreet ? "" : job.company,
      description: job.description,
      requirements: job.requirements,
      advantages: job.advantages,
      location: job.discreet ? "" : job.location,
      employmentType: job.employmentType,
      seniority: job.seniority,
      discreet: job.discreet,
    },
    analysis
  );

  // Every post must end with the CV-submission link when the job has one
  const withLink = (content: string) =>
    job.sourceUrl && !content.includes(job.sourceUrl)
      ? `${content}\n\n📩 להגשת קו״ח: ${job.sourceUrl}`
      : content;

  const created = await prisma.$transaction([
    prisma.post.deleteMany({ where: { jobId: id } }),
    prisma.post.create({ data: { jobId: id, channel: "linkedin", content: withLink(posts.linkedin) } }),
    prisma.post.create({ data: { jobId: id, channel: "facebook", content: withLink(posts.facebook) } }),
    prisma.post.create({ data: { jobId: id, channel: "whatsapp", content: withLink(posts.whatsapp) } }),
  ]);

  return NextResponse.json({ posts: created.slice(1), source: posts.source });
}
