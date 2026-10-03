import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { runEngine } from "./engine";
import { oppLabel } from "./model";
import * as repo from "./repository";

/**
 * Cargas compartidas por las páginas de Job Search, memorizadas por petición: el layout y la
 * página que se renderizan juntos leen la instantánea una sola vez.
 */

export const getSnapshot = cache(() => repo.loadSnapshot(db));

export const getWorkspace = cache(async () => {
  const snapshot = await getSnapshot();
  const profile = await repo.loadProfile(db, snapshot.goal.extraSkills, snapshot.goal.targetSeniority, snapshot.goal.targetRoles);
  return { snapshot, profile, engine: runEngine(snapshot, profile) };
});

export const getOptions = cache(async () => {
  const [opps, contacts] = await Promise.all([repo.listOpportunityOptions(db), repo.listContactOptions(db)]);
  return {
    opportunities: opps.map((o) => ({ value: o.id, label: oppLabel(o) })),
    contacts: contacts.map((c) => ({ value: c.id, label: c.companyName ? `${c.name} · ${c.companyName}` : c.name })),
  };
});

export { db };
