import "./estilos/tema.css";

// Pantalla provisoria: confirma que la ventana, la instancia única y el
// registro de errores arrancan bien. Se reemplaza por el layout real
// (§8.3) cuando arranque el primer módulo de negocio.
function App() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-2 bg-fondo text-texto">
      <h1 className="text-3xl font-semibold">Changuito</h1>
      <p className="text-texto-suave">Sistema de gestión — fundación en construcción</p>
    </main>
  );
}

export default App;
