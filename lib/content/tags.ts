/**
 * Etiquetas de caché. Cada lectura cacheada se etiqueta con la entidad de la que depende;
 * cada mutación del admin invalida exactamente las etiquetas a las que puede afectar.
 */
export const TAGS = {
  profile: "content:profile",
  experience: "content:experience",
  stack: "content:stack",
  projects: "content:projects",
  notes: "content:notes",
  education: "content:education",
  languages: "content:languages",
} as const;

export type ContentTag = (typeof TAGS)[keyof typeof TAGS];

/**
 * Qué vistas públicas dependen de qué entidad. Renombrar una tecnología, por
 * ejemplo, se refleja en la página del stack, las tarjetas de proyecto y las entradas de
 * experiencia.
 */
export const INVALIDATES = {
  profile: [TAGS.profile],
  socialLink: [TAGS.profile],
  experience: [TAGS.experience],
  technology: [TAGS.stack, TAGS.projects, TAGS.experience],
  technologyCategory: [TAGS.stack],
  project: [TAGS.projects, TAGS.stack],
  note: [TAGS.notes],
  education: [TAGS.education],
  language: [TAGS.languages],
} as const satisfies Record<string, readonly ContentTag[]>;
