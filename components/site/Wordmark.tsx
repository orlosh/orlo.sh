/** "orlo.sh" con el punto en verde. */
export function Wordmark({ brand }: { brand: string }) {
  const dot = brand.lastIndexOf(".");
  if (dot <= 0) return <>{brand}</>;
  return (
    <>
      {brand.slice(0, dot)}
      <span className="text-primary">.</span>
      {brand.slice(dot + 1)}
    </>
  );
}
