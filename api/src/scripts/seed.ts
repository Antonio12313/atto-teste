import { eq } from "drizzle-orm";
import { readEnv } from "../config/env.js";
import { createDatabase } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword } from "../modules/auth/password.js";
import { grantFullAccess } from "../modules/auth/login.js";

const env = readEnv();
const { sql, db } = createDatabase(env.DATABASE_URL);

try {
  const login = env.SEED_ADMIN_LOGIN.trim();
  const loginNormalized = login.toLowerCase();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.attoLoginNormalized, loginNormalized));

  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({
          attoLogin: login,
          attoLoginNormalized: loginNormalized,
          name: login,
          isLocal: true,
          passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
        })
        .returning()
    )[0]!;

  await grantFullAccess(db, user.id);
  console.info(
    existing
      ? `Usuário local "${login}" já existia — acesso total reconfirmado.`
      : `Usuário local "${login}" criado com acesso total. Senha: a configurada em SEED_ADMIN_PASSWORD.`,
  );
} catch (error) {
  console.error(
    "Falha ao rodar o seed.",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
