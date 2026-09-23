-- El rol de runtime puede escribir entradas de auditoría, pero nunca reescribirlas ni borrarlas.
-- Protegido para que la migración también se aplique en bases de datos sin el rol de la app
-- (p. ej., CI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolio_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_log" FROM portfolio_app;
  END IF;
END
$$;
