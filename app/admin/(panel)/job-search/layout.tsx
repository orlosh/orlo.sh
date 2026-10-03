import { JobSearchNav } from "@/components/admin/job-search/JobSearchNav";
import { QuickAdd } from "@/components/admin/job-search/QuickAdd";
import { getOptions, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: { default: "Job Search · Admin", template: "%s · Job Search · Admin" } };

export default async function JobSearchLayout({ children }: { children: React.ReactNode }) {
  const [options, snapshot] = await Promise.all([getOptions(), getSnapshot()]);
  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Job Search</p>
        <div className="flex flex-1 items-center justify-end gap-2">
          <form action="/admin/job-search/search" role="search" className="w-full max-w-xs">
            <label htmlFor="js-q" className="sr-only">
              Buscar en Job Search
            </label>
            <input id="js-q" name="q" type="search" placeholder="Buscar…" className="field" />
          </form>
          <QuickAdd opportunities={options.opportunities} contacts={options.contacts} today={snapshot.today} />
        </div>
      </div>
      <div className="mt-4">
        <JobSearchNav />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
