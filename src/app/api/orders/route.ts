import { checkoutSchema } from "@/domain/checkout";
import { createOrder } from "@/server/orders";
import { errorResponse, json } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const input = checkoutSchema.parse(await req.json());
    const order = await createOrder(input, "APP");
    return json({ token: order.publicToken, number: order.number }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
