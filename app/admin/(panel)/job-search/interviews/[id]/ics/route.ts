import { z } from "zod";
import { db } from "@/db/client";
import { getSession, isAdmin } from "@/lib/auth/guard";
import { icsFile } from "@/lib/job-search/calendar";
import { INTERVIEW_KIND_LABEL } from "@/lib/job-search/labels";
import { getInterview } from "@/lib/job-search/repository";

/**
 * Descarga .ics de una entrevista. Los Route Handlers no pasan por el layout del panel, así que
 * la autorización se comprueba aquí mismo.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(await getSession())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const data = await getInterview(db, id);
  if (!data?.interview.scheduledAt) return new Response("Not found", { status: 404 });
  const { interview: i } = data;
  const company = i.opportunity.company?.name;
  const title = `${INTERVIEW_KIND_LABEL[i.kind]} · ${company ? `${company} · ` : ""}${i.opportunity.title}`;
  const body = icsFile({
    id: i.id,
    title,
    start: i.scheduledAt!,
    minutes: i.durationMinutes ?? 45,
    description: [i.interviewerName ? `Interviewer: ${i.interviewerName}` : null, i.topics, i.meetingUrl].filter(Boolean).join("\n"),
    location: i.meetingUrl,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-${i.id.slice(0, 8)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
