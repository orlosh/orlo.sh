export function NavBar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-solid border-border-dark bg-background-dark/80 backdrop-blur-md px-6 md:px-20 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between whitespace-nowrap">
        {/* LOGO */}
        <div className="flex items-center gap-3">
          <h2 className="text-white text-lg font-bold leading-tight tracking-tight">
            wilson@portfolio:~$
          </h2>
        </div>
        {/* MENU */}
        <nav className="hidden md:flex items-center gap-10">
          <a
            className="text-slate-400 hover:text-primary transition-colors text-sm font-medium font-mono"
            href="#projects"
          >
            01. PROYECTOS
          </a>
          <a
            className="text-slate-400 hover:text-primary transition-colors text-sm font-medium font-mono"
            href="#experience"
          >
            02. EXPERIENCIA
          </a>
          <a
            className="text-slate-400 hover:text-primary transition-colors text-sm font-medium font-mono"
            href="#resume"
          >
            03. CURRÍCULUM
          </a>
        </nav>
        {/* CONTACTO */}
        <div className="flex items-center gap-4">
          <button className="flex min-w-30 cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-primary text-background-dark text-sm font-bold transition-transform hover:scale-105 active:scale-95">
            <span className="truncate">Contacto</span>
          </button>
          <div
            className="size-10 rounded-full border border-primary/30 p-0.5 bg-carbon"
            data-alt="User avatar placeholder"
          >
            {/* <div
              className="w-full h-full rounded-full bg-cover bg-center"
              data-alt="Developer profile picture"
              style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuDFWx0Sq-Lm35m7tzBbMa-jSfVJCzyi6WbyyI1IKfjd54b10eZ_gPww_e0H5g1JNsv-8W96G6oFu7J_WgI1gHqjKjmEKGVl1nUYUAhphb4e1h8Y9_2uUch4CkwmInFzb2WIpPvyGcJ44-cEIbVpNMOqlJaU85_62GZAcipX4dZDf0TDPga_K2XcbYlMXfNZMSPR45ubNCo4zWCI5fWKH_VAUuP3o4EwqL3FUExSNeURIpiYLWbKH9PsY5kkmVJ9xYaAkdBtXZti9eg')"
            ></div> */}
          </div>
        </div>
      </div>
    </header>
  );
}
