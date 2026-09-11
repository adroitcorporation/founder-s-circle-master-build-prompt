import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
export const db = new PrismaClient();
export type Tx = Prisma.TransactionClient;
// Serializable retries make block/message and status changes atomic under concurrency.
export async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 15000,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 4
      ) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            25 * 2 ** attempt + Math.floor(Math.random() * 25),
          ),
        );
        continue;
      }
      throw error;
    }
  }
}
