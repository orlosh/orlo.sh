import { relations } from "drizzle-orm";
import {
  experienceHighlights,
  experiences,
  experienceTechnologies,
  notes,
  noteTags,
  projectImages,
  projects,
  projectTechnologies,
  tags,
  technologies,
  technologyCategories,
} from "./schema";

export const technologyCategoriesRelations = relations(technologyCategories, ({ many }) => ({
  technologies: many(technologies),
}));

export const technologiesRelations = relations(technologies, ({ one, many }) => ({
  category: one(technologyCategories, {
    fields: [technologies.categoryId],
    references: [technologyCategories.id],
  }),
  projects: many(projectTechnologies),
  experiences: many(experienceTechnologies),
}));

export const experiencesRelations = relations(experiences, ({ many }) => ({
  highlights: many(experienceHighlights),
  technologies: many(experienceTechnologies),
}));

export const experienceHighlightsRelations = relations(experienceHighlights, ({ one }) => ({
  experience: one(experiences, {
    fields: [experienceHighlights.experienceId],
    references: [experiences.id],
  }),
}));

export const experienceTechnologiesRelations = relations(experienceTechnologies, ({ one }) => ({
  experience: one(experiences, {
    fields: [experienceTechnologies.experienceId],
    references: [experiences.id],
  }),
  technology: one(technologies, {
    fields: [experienceTechnologies.technologyId],
    references: [technologies.id],
  }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  technologies: many(projectTechnologies),
  images: many(projectImages),
}));

export const projectTechnologiesRelations = relations(projectTechnologies, ({ one }) => ({
  project: one(projects, { fields: [projectTechnologies.projectId], references: [projects.id] }),
  technology: one(technologies, {
    fields: [projectTechnologies.technologyId],
    references: [technologies.id],
  }),
}));

export const projectImagesRelations = relations(projectImages, ({ one }) => ({
  project: one(projects, { fields: [projectImages.projectId], references: [projects.id] }),
}));

export const notesRelations = relations(notes, ({ many }) => ({
  tags: many(noteTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  notes: many(noteTags),
}));

export const noteTagsRelations = relations(noteTags, ({ one }) => ({
  note: one(notes, { fields: [noteTags.noteId], references: [notes.id] }),
  tag: one(tags, { fields: [noteTags.tagId], references: [tags.id] }),
}));
