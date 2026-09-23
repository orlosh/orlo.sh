"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Cliente del navegador: habla con /api/auth en el mismo origen.
 * Solo lo usa el formulario de login.
 */
export const authClient = createAuthClient();
