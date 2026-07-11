import { Body, Controller, Get, Param, Post } from "@tsuki-hono/common";
import { chatService } from "../../../../packages/core/src/modules/chat/chat.service.js";
import { ClientError } from "../../../../packages/core/src/errors.js";
import { jsonResponse } from "../../httpResponse.js";

export { setChatDepsForTests } from "../../../../packages/core/src/modules/chat/chat.service.js";

@Controller("charts")
export class ChatController {
  @Get("/:id/chat")
  async getChat(@Param("id") id: string) {
    return chatService.get({ id });
  }

  @Post("/:id/chat/messages")
  async postMessage(@Param("id") id: string, @Body() body: { text?: unknown } | null) {
    const text = body?.text;
    if (typeof text !== "string") {
      throw new ClientError("`text` must be a non-empty string of at most 4000 characters", 'e.g. {"text": "..."}');
    }
    const result = await chatService.postMessage({ id, text });
    return jsonResponse(result.status, result.body);
  }
}
