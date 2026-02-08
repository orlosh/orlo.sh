"use client";

import { useState } from "react";

export function Terminal() {
  const [showError, setError] = useState<boolean>(false);
  return (
    <section className="mb-24">
      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-primary">
          data_object
        </span>
        <h2 className="text-white text-2xl font-bold">Terminal</h2>
      </div>
      <div className="w-full bg-[#0d0d0d] border border-border-dark rounded-xl overflow-hidden shadow-2xl">
        {/* HEADER */}
        <div className="bg-carbon px-4 py-2 border-b border-border-dark flex items-center justify-between">
          <div className="flex gap-2">
            <div className="size-3 rounded-full bg-[#ff5f56]"></div>
            <div className="size-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="size-3 rounded-full bg-[#27c93f]"></div>
          </div>
          <div className="text-slate-500 text-xs font-mono">bash</div>
          <div className="w-10"></div>
        </div>
        {/* BODY*/}
        <div className="p-6 font-mono text-sm md:text-base min-h-75 flex flex-col">
          <div className="space-y-2">
            <p className="text-slate-500 italic mb-4"># Iniciando...</p>
            <div className="flex gap-3">
              <span className="text-primary font-bold">
                wilson@portfolio:~$
              </span>
              <span className="text-white">./fetch-profile.sh</span>
            </div>
            <div className="pl-4 text-slate-400 space-y-1">
              <p>&gt; Llamando a la API... [Response: 200]</p>
              <p>&gt; Estructurando la respuesta...</p>
              <p>&gt; Analizando patrones...</p>
              <p className="text-primary">[OK] Se ha obtenido el perfil</p>
            </div>
            <div className="mt-4 p-4 bg-primary/5 border-l-4 border-primary rounded-r">
              <p className="text-white">
                <span className="text-primary font-bold">Sobre mí:</span>{" "}
                Desarrollador Full Stack con enfoque en DevOps. Experiencia en
                automatización e implementación de infraestructuras escalables.
              </p>
            </div>
            {/* USER INPUT */}
            <div className="flex gap-3 pt-4">
              <span className="text-primary font-bold">
                wilson@portfolio:~$
              </span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError(true);
                }}
              >
                <input
                  className="text-white flex items-center outline-none w-full"
                  placeholder="Escribe un comando.."
                  disabled={showError}
                />
              </form>
            </div>
            {/* ERROR HASTA IMPLEMENTACION */}
            {showError && (
              <div className="mt-4 p-4 bg-red-500/5 border-l-4 border-red-500 rounded-r">
                <p className="text-white">
                  <span className="text-red-500 font-bold">Error:</span> En
                  proceso de implementar esta funcionalidad. ¡Pronto podrás
                  interactuar conmigo a través de la terminal! 🚀
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
