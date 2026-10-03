import Link from "next/link";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { Empty, PageHeader, Section, Stat } from "@/components/admin/job-search/ui";
import { setTaskDoneAction } from "@/lib/job-search/actions";
import { addDays, diffDays, relativeDay } from "@/lib/job-search/dates";
import { CONTACT_KIND_LABEL, REFERRAL_STATUS_LABEL } from "@/lib/job-search/labels";
import type { ContactSnap, OppSnap, ReferralSnap } from "@/lib/job-search/model";
import { oppLabel } from "@/lib/job-search/model";
import { getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "A quién escribir" };

function ContactList({ contacts, detail }: { contacts: ContactSnap[]; detail: (c: ContactSnap) => string }) {
  if (!contacts.length) return <Empty>Nadie aquí.</Empty>;
  return (
    <ul className="panel divide-y divide-slate-200">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link href={`/admin/job-search/contacts/${c.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
            <span className="block text-sm text-carbon">
              {c.name}
              {c.companyName ? <span className="text-slate-500"> · {c.companyName}</span> : null}
            </span>
            <span className="block text-xs text-slate-600">
              {CONTACT_KIND_LABEL[c.kind]} · {detail(c)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ReferralList({ list, opps, contacts, today }: { list: ReferralSnap[]; opps: Map<string, OppSnap>; contacts: Map<string, ContactSnap>; today: string }) {
  if (!list.length) return <Empty>Ninguno.</Empty>;
  return (
    <ul className="panel divide-y divide-slate-200">
      {list.map((r) => {
        const o = opps.get(r.opportunityId);
        const c = r.contactId ? contacts.get(r.contactId) : null;
        return (
          <li key={r.id}>
            <Link href={`/admin/job-search/opportunities/${r.opportunityId}?tab=contacts`} className="block px-4 py-2.5 hover:bg-slate-50">
              <span className="block text-sm text-carbon">{o ? oppLabel(o) : "—"}</span>
              <span className="block text-xs text-slate-600">
                {c?.name ?? "Sin contacto"} · {REFERRAL_STATUS_LABEL[r.status]} {relativeDay(r.status === "received" ? r.receivedAt : r.requestedAt, today)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function NetworkingPage() {
  const s = await getSnapshot();
  const { today, goal } = s;
  const opps = new Map(s.opportunities.map((o) => [o.id, o]));
  const contactsById = new Map(s.contacts.map((c) => [c.id, c]));
  const last = (c: ContactSnap) => `última interacción ${relativeDay(c.lastInteractionAt, today)}`;

  const toContact = s.contacts.filter((c) => c.status === "to_contact");
  const followUpTasks = s.tasks.filter((t) => t.status === "open" && t.contactId && t.kind === "follow_up" && t.dueDate && t.dueDate <= addDays(today, 2));
  const dueContacts = s.contacts.filter((c) => c.status !== "closed" && c.nextFollowUpAt && c.nextFollowUpAt <= addDays(today, 2) && !followUpTasks.some((t) => t.contactId === c.id));
  const active = s.contacts.filter((c) => c.status === "in_conversation");
  const requested = s.referrals.filter((r) => r.status === "requested");
  const received = s.referrals.filter((r) => r.status === "received");
  const recruiters = s.contacts.filter((c) => c.kind === "recruiter" && c.status !== "to_contact");
  const managers = s.contacts.filter((c) => c.kind === "hiring_manager" && c.status !== "to_contact");
  // Sin respuesta: marcados así, o contactados hace más días de los que fija la regla de recruiter.
  const silent = s.contacts.filter(
    (c) => c.status === "no_response" || (c.status === "contacted" && c.lastInteractionAt && diffDays(c.lastInteractionAt, today) > goal.followupRecruiterDays),
  );

  return (
    <div className="space-y-10">
      <PageHeader title="A quién escribir" description="Con quién hablar hoy y qué conversaciones siguen abiertas." />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Por contactar" value={toContact.length} />
        <Stat label="Seguimientos (≤ 2 días)" value={followUpTasks.length + dueContacts.length} />
        <Stat label="Conversaciones activas" value={active.length} />
        <Stat label="Recomendaciones recibidas" value={received.length} hint={`${requested.length} pendientes`} />
      </dl>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title={`Personas a contactar · ${toContact.length}`}>
          <ContactList contacts={toContact} detail={(c) => `primer mensaje pendiente desde hace ${diffDays(c.createdAt.toISOString().slice(0, 10), today)} d`} />
        </Section>
        <Section title="Seguimientos">
          {followUpTasks.length || dueContacts.length ? (
            <ul className="panel divide-y divide-slate-200">
              {followUpTasks.map((t) => {
                const c = contactsById.get(t.contactId!);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link href={`/admin/job-search/contacts/${t.contactId}`} className="min-w-0 hover:underline">
                      <span className="block text-sm text-carbon">{c?.name ?? t.title}</span>
                      <span className="block text-xs text-slate-600">{t.title} · {relativeDay(t.dueDate, today)}</span>
                    </Link>
                    <ActionButton action={setTaskDoneAction} hidden={{ id: t.id }} label="Hecho" />
                  </li>
                );
              })}
              {dueContacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/job-search/contacts/${c.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <span className="block text-sm text-carbon">{c.name}</span>
                    <span className="block text-xs text-slate-600">Follow-up {relativeDay(c.nextFollowUpAt, today)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sin seguimientos próximos.</Empty>
          )}
        </Section>
        <Section title={`Conversaciones activas · ${active.length}`}>
          <ContactList contacts={active} detail={last} />
        </Section>
        <Section title={`Contactos sin respuesta · ${silent.length}`}>
          <ContactList contacts={silent} detail={last} />
        </Section>
        <Section title={`Recomendaciones pedidas · ${requested.length}`}>
          <ReferralList list={requested} opps={opps} contacts={contactsById} today={today} />
        </Section>
        <Section title={`Recomendaciones recibidas · ${received.length}`}>
          <ReferralList list={received} opps={opps} contacts={contactsById} today={today} />
        </Section>
        <Section title={`Reclutadores contactados · ${recruiters.length}`}>
          <ContactList contacts={recruiters} detail={last} />
        </Section>
        <Section title={`Responsables de contratación contactados · ${managers.length}`}>
          <ContactList contacts={managers} detail={last} />
        </Section>
      </div>
    </div>
  );
}
