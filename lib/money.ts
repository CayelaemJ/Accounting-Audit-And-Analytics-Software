/** Ledger amounts are decimal strings, never JS floating-point balances. */
export function toCents(input: string): bigint {
  if (!/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/.test(input)) {
    throw new Error("Amount must be a non-negative decimal with up to two places");
  }
  const [whole, fractional = ""] = input.split(".");
  return BigInt(whole) * 100n + BigInt((fractional + "00").slice(0, 2));
}
export function fromCents(cents: bigint): string {
  const absolute = cents < 0n ? -cents : cents;
  return (cents < 0n ? "-" : "") + String(absolute / 100n) + "." + String(absolute % 100n).padStart(2,"0");
}
export type PostingLine = { accountId: string; side: "debit" | "credit"; amount: string };
export function validatePosting(lines: PostingLine[]) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) throw new Error("A journal requires 2–100 lines");
  let debit = 0n, credit = 0n;
  for (const line of lines) {
    const cents = toCents(line.amount);
    if (cents <= 0n) throw new Error("Each line needs a positive amount");
    if (line.side === "debit") debit += cents;
    else if (line.side === "credit") credit += cents;
    else throw new Error("Invalid journal side");
  }
  if (debit !== credit) throw new Error("Total debits must equal total credits");
  return { debit: fromCents(debit), credit: fromCents(credit) };
}
