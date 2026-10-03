import { relations } from "drizzle-orm";
import {
  experienceHighlights,
  jobActivities,
  jobCompanies,
  jobContacts,
  jobDocuments,
  jobInterviews,
  jobNotes,
  jobOpportunities,
  jobOpportunityContacts,
  jobOpportunityDocuments,
  jobReferrals,
  jobStatusHistory,
  jobTasks,
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

/* ------------------------------------------------------------- job search */

export const jobCompaniesRelations = relations(jobCompanies, ({ many }) => ({
  opportunities: many(jobOpportunities),
  contacts: many(jobContacts),
}));

export const jobOpportunitiesRelations = relations(jobOpportunities, ({ one, many }) => ({
  company: one(jobCompanies, { fields: [jobOpportunities.companyId], references: [jobCompanies.id] }),
  contacts: many(jobOpportunityContacts),
  interviews: many(jobInterviews),
  tasks: many(jobTasks),
  activities: many(jobActivities),
  referrals: many(jobReferrals),
  documents: many(jobOpportunityDocuments),
  // No "notes": chocaría con la columna notes de la oportunidad.
  noteEntries: many(jobNotes),
  history: many(jobStatusHistory),
}));

export const jobStatusHistoryRelations = relations(jobStatusHistory, ({ one }) => ({
  opportunity: one(jobOpportunities, {
    fields: [jobStatusHistory.opportunityId],
    references: [jobOpportunities.id],
  }),
}));

export const jobContactsRelations = relations(jobContacts, ({ one, many }) => ({
  company: one(jobCompanies, { fields: [jobContacts.companyId], references: [jobCompanies.id] }),
  opportunities: many(jobOpportunityContacts),
  referrals: many(jobReferrals),
}));

export const jobOpportunityContactsRelations = relations(jobOpportunityContacts, ({ one }) => ({
  opportunity: one(jobOpportunities, {
    fields: [jobOpportunityContacts.opportunityId],
    references: [jobOpportunities.id],
  }),
  contact: one(jobContacts, { fields: [jobOpportunityContacts.contactId], references: [jobContacts.id] }),
}));

export const jobReferralsRelations = relations(jobReferrals, ({ one }) => ({
  opportunity: one(jobOpportunities, { fields: [jobReferrals.opportunityId], references: [jobOpportunities.id] }),
  contact: one(jobContacts, { fields: [jobReferrals.contactId], references: [jobContacts.id] }),
}));

export const jobInterviewsRelations = relations(jobInterviews, ({ one }) => ({
  opportunity: one(jobOpportunities, { fields: [jobInterviews.opportunityId], references: [jobOpportunities.id] }),
  interviewer: one(jobContacts, { fields: [jobInterviews.interviewerContactId], references: [jobContacts.id] }),
}));

export const jobTasksRelations = relations(jobTasks, ({ one }) => ({
  opportunity: one(jobOpportunities, { fields: [jobTasks.opportunityId], references: [jobOpportunities.id] }),
  contact: one(jobContacts, { fields: [jobTasks.contactId], references: [jobContacts.id] }),
  interview: one(jobInterviews, { fields: [jobTasks.interviewId], references: [jobInterviews.id] }),
  company: one(jobCompanies, { fields: [jobTasks.companyId], references: [jobCompanies.id] }),
}));

export const jobActivitiesRelations = relations(jobActivities, ({ one }) => ({
  opportunity: one(jobOpportunities, { fields: [jobActivities.opportunityId], references: [jobOpportunities.id] }),
  contact: one(jobContacts, { fields: [jobActivities.contactId], references: [jobContacts.id] }),
}));

export const jobOpportunityDocumentsRelations = relations(jobOpportunityDocuments, ({ one }) => ({
  opportunity: one(jobOpportunities, {
    fields: [jobOpportunityDocuments.opportunityId],
    references: [jobOpportunities.id],
  }),
  document: one(jobDocuments, { fields: [jobOpportunityDocuments.documentId], references: [jobDocuments.id] }),
}));

export const jobDocumentsRelations = relations(jobDocuments, ({ many }) => ({
  usages: many(jobOpportunityDocuments),
}));

export const jobNotesRelations = relations(jobNotes, ({ one }) => ({
  opportunity: one(jobOpportunities, { fields: [jobNotes.opportunityId], references: [jobOpportunities.id] }),
}));
