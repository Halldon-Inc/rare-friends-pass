export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  console.log(JSON.stringify({ tag: "apple-wallet-log", logs: (body as { logs?: unknown })?.logs ?? null }));
  return new Response(null, { status: 200 });
}
