// Claude を1回呼んだときのトークン数（料金の見積もりのため。数だけで、中身は入れない）

interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function usageOf(response: { model?: string; usage?: UsageLike }) {
  const u = response.usage ?? {};
  return {
    model: response.model ?? "",
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}
