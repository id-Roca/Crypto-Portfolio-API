const coinGeckoIds = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
};

export const getCryptoPrices = async (symbols) => {
  const ids = symbols.map((symbol) => coinGeckoIds[symbol]).filter(Boolean);

  const url = new URL("https://api.coingecko.com/api/v3/simple/price");

  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", "eur");

  let response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    const apiError = new Error(
      "Unable to reach cryptocurrency price provider.",
    );
    apiError.statusCode = 503;
    throw apiError;
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? "Cryptocurrency price provider rate limit exceeded."
        : "Cryptocurrency price provider is currently unavailable.",
    );

    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    const apiError = new Error(
      "Invalid response from cryptocurrency price provider.",
    );
    apiError.statusCode = 502;
    throw apiError;
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const error = new Error("Invalid cryptocurrency price data.");
    error.statusCode = 502;
    throw error;
  }

  return Object.fromEntries(
    symbols.map((symbol) => {
      const price = data[coinGeckoIds[symbol]]?.eur;

      return [
        symbol,
        typeof price === "number" && Number.isFinite(price) && price > 0
          ? price
          : null,
      ];
    }),
  );
};
