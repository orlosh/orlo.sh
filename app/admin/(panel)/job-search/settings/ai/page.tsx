import { ActionForm } from "@/components/admin/ActionForm";
import { Checkbox, Select, TextArea, TextField } from "@/components/admin/fields";
import { AiButton } from "@/components/admin/job-search/ai";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { SettingsNav } from "@/components/admin/job-search/SettingsNav";
import { Badge, Empty, Muted, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { addApiKeyAction, runRadarAction, saveAiSettingsAction, saveSourceKeysAction, testApiKeyAction, updateApiKeyAction } from "@/lib/ai/actions";
import { listAiRuns, listApiKeys, listKeyModels, listRadarRuns, usageByFeature } from "@/lib/ai/admin";
import { ADZUNA_COUNTRIES, RADAR_SOURCES } from "@/lib/ai/sources";
import { getAiSettings } from "@/lib/ai/store";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/job-search/dates";
import { listCvDocuments } from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Inteligencia artificial" };

/** Modelos sugeridos (octubre de 2026). Se puede escribir cualquier otro identificador. */
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.1-pro-preview"];

const FEATURE_LABEL: Record<string, string> = {
  import: "Importar oferta",
  match: "Encaje con el CV",
  cover_letter: "Carta de presentación",
  company_research: "Investigar empresa",
  interview_prep: "Preparar entrevista",
  message: "Mensajes",
  rehearsal: "Ensayo de respuestas",
  coach: "Coach semanal",
  radar_search: "Radar · búsqueda",
  radar_eval: "Radar · evaluación",
  test: "Prueba de clave",
};

function KeyOp({ id, op, label, confirmText }: { id: string; op: string; label: string; confirmText?: string }) {
  return <ActionButton action={updateApiKeyAction} hidden={{ id, op }} label={label} variant="link" confirmText={confirmText} />;
}

export default async function AiSettingsPage() {
  const [settings, keys, keyModels, runs, usage, radarRuns, cvs, s] = await Promise.all([
    getAiSettings(db),
    listApiKeys(db),
    listKeyModels(db),
    listAiRuns(db, 30),
    usageByFeature(db, 7),
    listRadarRuns(db, 5),
    listCvDocuments(db),
    getSnapshot(),
  ]);
  const tz = s.goal.timezone;
  const now = new Date();
  // Disponibles para el modelo principal: ni rechazadas ni en espera con ese modelo.
  const available = keys.filter(
    (k) =>
      k.enabled &&
      (!k.cooldownUntil || k.cooldownUntil <= now) &&
      !keyModels.some((km) => km.keyId === k.id && km.model === settings.modelDefault && km.cooldownUntil && km.cooldownUntil > now),
  ).length;
  const cronReady = !!env().CRON_SECRET;

  return (
    <div className="max-w-5xl space-y-10">
      <SettingsNav current="ai" />
      <PageHeader
        title="Inteligencia artificial"
        description="Gemini analiza ofertas, compara con tu CV, redacta cartas y mensajes, prepara entrevistas y busca ofertas por ti. Todo se configura aquí."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs text-slate-600">Estado</p>
          <p className="mt-1 font-medium text-carbon">{settings.enabled ? "Activada" : "Desactivada"}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-slate-600">Claves disponibles ahora (modelo principal)</p>
          <p className="mt-1 font-mono text-xl text-carbon">
            {available} <span className="text-sm text-slate-500">de {keys.length}</span>
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-slate-600">Radar programado</p>
          <p className="mt-1 text-sm text-carbon">
            {!settings.radarEnabled ? "Desactivado" : cronReady ? `Cada ${settings.radarFrequencyDays === 1 ? "día" : `${settings.radarFrequencyDays} días`}` : "Falta CRON_SECRET en Vercel"}
          </p>
        </div>
      </div>

      <p className="rounded-md bg-white px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
        <span className="font-medium text-carbon">Qué se envía a Google:</span> el texto de las ofertas, tu CV, tu perfil y las notas que uses en cada petición. En el plan gratuito de la API de
        Gemini, Google puede usar ese contenido para mejorar sus productos. Las respuestas se validan y las afirmaciones sobre ti se comprueban contra tu CV antes de guardarse.
      </p>

      <Section title="Claves de Gemini">
        <p className="text-sm text-slate-600">
          Se usan en este orden: si una alcanza su límite o falla, se pasa a la siguiente y la primera queda en espera hasta que se recupere. Google cuenta los límites gratuitos{" "}
          <strong className="font-medium text-carbon">por proyecto</strong>: crea cada clave en un proyecto distinto de{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="link">
            Google AI Studio
          </a>{" "}
          para sumar cuota. Se guardan cifradas y nunca se vuelven a mostrar.
        </p>
        {keys.length ? (
          <Table head={["Orden", "Clave", "Estado", "Uso", "Último uso", ""]} minWidth="52rem">
            {keys.map((k, i) => {
              const cooling = k.cooldownUntil && k.cooldownUntil > now;
              return (
                <tr key={k.id}>
                  <td className={td}>
                    <Muted>{i + 1}</Muted>
                  </td>
                  <td className={td}>
                    <span className="whitespace-nowrap text-carbon">{k.label}</span>
                    <span className="block font-mono text-xs text-slate-500">••••{k.keyLast4}</span>
                  </td>
                  <td className={td}>
                    {!k.enabled ? <Badge tone="muted">Desactivada</Badge> : cooling ? <Badge>Rechazada hasta {formatDateTime(k.cooldownUntil, tz)}</Badge> : <Badge tone="dark">Activa</Badge>}
                    <ul className="mt-1.5 space-y-0.5">
                      {keyModels
                        .filter((km) => km.keyId === k.id)
                        .map((km) => {
                          const waiting = km.cooldownUntil && km.cooldownUntil > now;
                          return (
                            <li key={km.model} className="font-mono text-[0.7rem] text-slate-600" title={km.lastError ?? undefined}>
                              {km.model}: {waiting ? `en espera hasta ${formatDateTime(km.cooldownUntil, tz)}` : "disponible"} · {km.successCount} ok / {km.failureCount} fallos
                            </li>
                          );
                        })}
                    </ul>
                    {k.searchBlockedUntil && k.searchBlockedUntil > now ? (
                      <span className="mt-1 block text-xs text-slate-500">Sin Google Search en su plan (se reintenta {formatDateTime(k.searchBlockedUntil, tz)})</span>
                    ) : null}
                    {k.lastError ? <span className="mt-1 block max-w-[18rem] text-xs text-slate-500">Último error: {k.lastError}</span> : null}
                  </td>
                  <td className={td}>
                    <Muted>
                      {k.successCount} ok · {k.failureCount} fallos
                    </Muted>
                    <span className="block text-[0.7rem] text-slate-500">en total</span>
                  </td>
                  <td className={td}>
                    <Muted>{k.lastUsedAt ? formatDateTime(k.lastUsedAt, tz) : "—"}</Muted>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap items-start gap-0.5">
                      <AiButton action={testApiKeyAction} hidden={{ id: k.id }} label="Probar" pendingLabel="Probando…" />
                      {i > 0 ? <KeyOp id={k.id} op="up" label="Subir" /> : null}
                      {i < keys.length - 1 ? <KeyOp id={k.id} op="down" label="Bajar" /> : null}
                      {cooling ? <KeyOp id={k.id} op="reset" label="Reactivar" /> : null}
                      <KeyOp id={k.id} op={k.enabled ? "disable" : "enable"} label={k.enabled ? "Desactivar" : "Activar"} />
                      <KeyOp id={k.id} op="delete" label="Eliminar" confirmText={`¿Eliminar la clave «${k.label}»? No se puede recuperar.`} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>Aún no hay claves. Crea una gratis en Google AI Studio y pégala aquí.</Empty>
        )}
        <ActionForm action={addApiKeyAction} submitLabel="Añadir clave" className="panel grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_2fr] md:items-end">
          <TextField name="label" label="Nombre" placeholder="Proyecto 1" required />
          <TextField name="apiKey" label="Clave de la API" type="password" placeholder="AIza…" required />
        </ActionForm>
      </Section>

      <Section title="Funcionamiento y radar">
        <ActionForm action={saveAiSettingsAction} className="space-y-8">
          <fieldset className="panel grid grid-cols-1 gap-5 p-4 md:grid-cols-2">
            <legend className="sr-only">General</legend>
            <div className="space-y-3 md:col-span-2">
              <Checkbox name="enabled" label="Activar la IA" defaultChecked={settings.enabled} />
              <Checkbox name="useSearch" label="Usar Google Search cuando el plan lo permita" defaultChecked={settings.useSearch} />
              <p className="-mt-2 pl-6 text-xs text-slate-600">
                En el plan gratuito, Gemini 3 no incluye Google Search: cada clave que no lo tenga se detecta sola y sus llamadas siguen sin búsqueda, sin errores. La lectura directa
                de la URL de una oferta es gratuita y se usa siempre.
              </p>
              <Checkbox name="autoMatch" label="Calcular el encaje con mi CV al importar una oferta" defaultChecked={settings.autoMatch} />
              <Checkbox
                name="urlContextFallbackOnly"
                label="Descargar la oferta desde el servidor y que Gemini solo lea la URL si el servidor no puede (ahorra cuota)"
                defaultChecked={settings.urlContextFallbackOnly}
              />
            </div>
            <Checkbox name="modelFallback" label="Si el modelo principal se agota, usar el ligero (Google limita cada modelo por separado)" defaultChecked={settings.modelFallback} />
            <TextField
              name="requestsPerMinute"
              label="Peticiones por minuto, por clave y modelo"
              type="number"
              defaultValue={settings.requestsPerMinute}
              hint={`Entre dos llamadas con la misma clave y modelo se espera al menos ${Math.ceil(60 / settings.requestsPerMinute)} s. Ponlo igual o por debajo del límite de tu plan (AI Studio → Rate limits).`}
            />
            <ModelField name="modelDefault" label="Modelo principal" value={settings.modelDefault} hint="Análisis, cartas, preparación. Calidad." />
            <ModelField name="modelLight" label="Modelo ligero" value={settings.modelLight} hint="Evaluar resultados del radar. Rápido y con más cuota." />
            <Select
              name="cvDocumentId"
              label="CV de referencia"
              options={[{ value: "", label: "El CV con texto más reciente" }, ...cvs.map((d) => ({ value: d.id, label: `${d.name}${d.version ? ` (${d.version})` : ""}` }))]}
              defaultValue={settings.cvDocumentId ?? ""}
              hint={cvs.length ? undefined : "No hay CVs con texto: se usará tu experiencia registrada. Pega tu CV en Documentos."}
            />
            <div className="md:col-span-2">
              <TextArea
                name="profileContext"
                label="Contexto adicional sobre ti"
                rows={4}
                defaultValue={settings.profileContext}
                hint="Solo hechos reales que no estén en el CV: disponibilidad, idiomas, visado, qué buscas y qué no. La IA podrá citarlo."
              />
            </div>
          </fieldset>

          <fieldset className="panel grid grid-cols-1 gap-5 p-4 md:grid-cols-3">
            <legend className="sr-only">Radar</legend>
            <div className="md:col-span-3">
              <Checkbox name="radarEnabled" label="Radar de ofertas: buscar automáticamente ofertas que encajen" defaultChecked={settings.radarEnabled} />
              <p className="mt-1 text-xs text-slate-600">
                Reúne ofertas de las fuentes elegidas, descarta las que no encajan con tus búsquedas, mide el encaje con tu CV y añade a la bandeja las que superan el umbral.
                {cronReady ? "" : " La ejecución programada necesita la variable CRON_SECRET en Vercel; mientras tanto puedes lanzarlo a mano."}
              </p>
            </div>
            <div className="md:col-span-2">
              <TextArea name="radarQueries" label="Búsquedas" rows={3} defaultValue={settings.radarQueries} hint="Una por línea, p. ej. «Senior Backend Engineer Node.js remoto». Vacío = tus roles objetivo." />
            </div>
            <div className="space-y-5">
              <TextField name="radarLocations" label="Ubicaciones" defaultValue={settings.radarLocations} hint="Separadas por comas." />
              <TextField name="radarExcludedCompanies" label="Empresas excluidas" defaultValue={settings.radarExcludedCompanies} />
            </div>
            <fieldset className="space-y-2 md:col-span-3">
              <legend className="field-label">Fuentes</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {Object.entries(RADAR_SOURCES).map(([value, label]) => {
                  const missing = (value === "adzuna" && !settings.adzunaKeyCiphertext) || (value === "brave" && !settings.braveKeyCiphertext);
                  return (
                    <label key={value} className="flex items-center gap-2 text-sm text-slate-800">
                      <input type="checkbox" name="radarSources" value={value} defaultChecked={settings.radarSources.includes(value)} className="size-4 accent-primary" />
                      {label}
                      {missing ? <span className="text-xs text-slate-500">· sin clave</span> : null}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-slate-600">
                Para «Empresas objetivo», guarda en Empresas su URL de empleo de Greenhouse, Lever o Ashby (p. ej. https://jobs.lever.co/empresa). Remotive se consulta una vez por ejecución
                y sus ofertas se muestran citándolo, como piden sus condiciones.
              </p>
            </fieldset>
            <TextField name="radarMinMatch" label="Encaje mínimo (%)" type="number" defaultValue={settings.radarMinMatch} />
            <TextField name="radarMaxPerRun" label="Ofertas evaluadas por ejecución" type="number" defaultValue={settings.radarMaxPerRun} hint="Cada una es una llamada al modelo ligero." />
            <TextField name="radarMaxAgeDays" label="Antigüedad máxima (días)" type="number" defaultValue={settings.radarMaxAgeDays} />
            <TextField name="radarFrequencyDays" label="Frecuencia (días)" type="number" defaultValue={settings.radarFrequencyDays} />
            <TextField name="timeBudgetSeconds" label="Tiempo máximo por ejecución (s)" type="number" defaultValue={settings.timeBudgetSeconds} hint="Por debajo del límite de la función (300 s)." />
          </fieldset>
        </ActionForm>
        <div className="flex flex-wrap items-start gap-3">
          <AiButton action={runRadarAction} hidden={{}} label="Ejecutar el radar ahora" pendingLabel="Buscando y evaluando ofertas… (puede tardar unos minutos)" />
          {radarRuns[0] ? (
            <p className="text-xs text-slate-600">
              Última ejecución: {formatDateTime(radarRuns[0].startedAt, tz)} · {radarRuns[0].found} nuevas, {radarRuns[0].evaluated} evaluadas, {radarRuns[0].added} añadidas
              {radarRuns[0].error ? ` · ${radarRuns[0].error}` : ""}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Fuentes con clave para el radar">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="panel space-y-3 p-4">
            <p className="text-sm text-slate-700">
              <span className="font-medium text-carbon">Adzuna</span> · buscador de empleo con API gratuita (unas 1.000 llamadas al mes). Crea la clave en{" "}
              <a href="https://developer.adzuna.com/" target="_blank" rel="noopener noreferrer" className="link">
                developer.adzuna.com
              </a>
              .{" "}
              {settings.adzunaKeyCiphertext ? (
                <span className="text-slate-600">
                  Configurada: app_id {settings.adzunaAppId}, clave ••••{settings.adzunaKeyLast4}.
                </span>
              ) : (
                <span className="text-slate-600">Sin configurar.</span>
              )}
            </p>
            <ActionForm action={saveSourceKeysAction} hidden={{ provider: "adzuna" }} submitLabel="Guardar Adzuna" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <TextField name="appId" label="app_id" defaultValue={settings.adzunaAppId} />
              <TextField name="appKey" label="app_key" type="password" placeholder={settings.adzunaKeyCiphertext ? "Sin cambios" : ""} />
              <Select name="country" label="País" options={ADZUNA_COUNTRIES.map((c) => ({ value: c, label: c.toUpperCase() }))} defaultValue={settings.adzunaCountry} />
              {settings.adzunaKeyCiphertext ? (
                <div className="sm:col-span-3">
                  <Checkbox name="clear" label="Borrar las credenciales de Adzuna" />
                </div>
              ) : null}
            </ActionForm>
          </div>
          <div className="panel space-y-3 p-4">
            <p className="text-sm text-slate-700">
              <span className="font-medium text-carbon">Brave Search</span> · busca en la web ofertas parecidas en Greenhouse, Lever y Ashby para descubrir empresas que contratan para tu perfil;
              de cada una se lee su tablón completo. Requiere tarjeta: Brave da unos 5 $ de crédito al mes (≈1.000 búsquedas) y el radar usa como mucho 2 por ejecución. Clave en{" "}
              <a href="https://api-dashboard.search.brave.com/" target="_blank" rel="noopener noreferrer" className="link">
                api-dashboard.search.brave.com
              </a>
              . {settings.braveKeyCiphertext ? <span className="text-slate-600">Configurada: ••••{settings.braveKeyLast4}.</span> : <span className="text-slate-600">Sin configurar.</span>}
            </p>
            <ActionForm action={saveSourceKeysAction} hidden={{ provider: "brave" }} submitLabel="Guardar Brave" className="space-y-4">
              <TextField name="apiKey" label="Clave de la API" type="password" placeholder={settings.braveKeyCiphertext ? "Sin cambios" : ""} />
              {settings.braveKeyCiphertext ? <Checkbox name="clear" label="Borrar la clave de Brave" /> : null}
            </ActionForm>
          </div>
        </div>
        <p className="text-xs text-slate-600">Para usarlas, márcalas también en las fuentes del radar (arriba). Se guardan cifradas y no se vuelven a mostrar.</p>
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Section title="Uso en los últimos 7 días">
          {usage.length ? (
            <Table head={["Función", "Bien", "Errores", "Tokens"]} minWidth="20rem">
              {usage.map((u) => (
                <tr key={u.feature}>
                  <td className={td}>{FEATURE_LABEL[u.feature] ?? u.feature}</td>
                  <td className={td}>{u.ok}</td>
                  <td className={td}>{u.error}</td>
                  <td className={td}>
                    <Muted>{u.tokens.toLocaleString("es-ES")}</Muted>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Sin llamadas todavía.</Empty>
          )}
        </Section>
        <Section title="Últimas llamadas">
          {runs.length ? (
            <Table head={["Cuándo", "Función", "Modelo", "Clave", "Resultado"]} minWidth="36rem">
              {runs.map(({ run, keyLabel }) => (
                <tr key={run.id}>
                  <td className={td}>
                    <Muted>{formatDateTime(run.createdAt, tz)}</Muted>
                  </td>
                  <td className={td}>{FEATURE_LABEL[run.feature.split(":")[0]] ?? run.feature}</td>
                  <td className={td}>
                    <Muted>{run.model}</Muted>
                  </td>
                  <td className={td}>
                    <Muted>
                      {keyLabel ?? "—"}
                      {run.attempts > 1 ? ` · ${run.attempts} intentos` : ""}
                    </Muted>
                  </td>
                  <td className={td}>
                    {run.status === "ok" ? (
                      <Muted>{run.latencyMs ? `${(run.latencyMs / 1000).toFixed(1)} s` : "ok"}</Muted>
                    ) : (
                      <span className="block max-w-[18rem] text-xs text-slate-700">{run.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Sin llamadas todavía.</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}

function ModelField({ name, label, value, hint }: { name: string; label: string; value: string; hint: string }) {
  const listId = `models-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={`f-${name}`} className="field-label block">
        {label}
      </label>
      <input id={`f-${name}`} name={name} list={listId} defaultValue={value} className="field font-mono" autoComplete="off" />
      <datalist id={listId}>
        {MODELS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <p className="text-xs text-slate-600">{hint}</p>
    </div>
  );
}
