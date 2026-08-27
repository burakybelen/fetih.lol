// Biri teklif verdiğinde çağrılır. Fiyatı TARAYICIDAN DEĞİL burada, sunucuda hesaplar
// (biri konsoldan sahte düşük fiyat gönderemesin diye). Supabase'ten güncel fiyatı okur,
// yeni teklif fiyatını hesaplar, Lemon Squeezy'de o fiyata özel bir ödeme sayfası oluşturur.

const SUPABASE_URL = "https://nkcsjjvxcerqusgbctkw.supabase.co";
const SUPABASE_KEY = "sb_publishable_DpTJEnBLg0oKRjV3v4CSyA_UrQeTUbC"; // publishable, sadece okuma için güvenli

const STORE_ID = "460135";
const VARIANT_ID = "2057998";

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const API_KEY = process.env.LEMONSQUEEZY_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "LEMONSQUEEZY_API_KEY env var eksik" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Geçersiz istek gövdesi" }) };
  }

  const { country_id, owner_name, social } = payload;
  if (!country_id || !owner_name) {
    return { statusCode: 400, body: JSON.stringify({ error: "country_id ve owner_name zorunlu" }) };
  }

  try {
    // 1) Supabase'ten ülkenin güncel fiyatını oku (yoksa varsayılan taban fiyat client'tan gelir)
    const claimRes = await fetch(
      `${SUPABASE_URL}/rest/v1/claims?country_id=eq.${encodeURIComponent(country_id)}&select=price`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const claimRows = await claimRes.json();
    const currentPrice = claimRows && claimRows[0] ? Number(claimRows[0].price) : Number(payload.fallback_base_price || 20);

    const newPrice = Math.round(currentPrice * (1.2 + Math.random() * 0.3));
    const priceInCents = newPrice * 100;

    // 2) Lemon Squeezy'de bu fiyata özel bir checkout oluştur
    const lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Accept": "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            custom_price: priceInCents,
            checkout_data: {
              custom: { country_id, owner_name, social: social || "" }
            },
            product_options: {
              name: `Fetih: ${country_id.toUpperCase()}`,
              redirect_url: `https://fetih.lol/?fethedildi=${country_id}`
            }
          },
          relationships: {
            store: { data: { type: "stores", id: STORE_ID } },
            variant: { data: { type: "variants", id: VARIANT_ID } }
          }
        }
      })
    });

    const lsData = await lsRes.json();
    if (!lsRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Lemon Squeezy hatası", detail: lsData }) };
    }

    const checkoutUrl = lsData.data.attributes.url;
    return { statusCode: 200, body: JSON.stringify({ checkout_url: checkoutUrl, price: newPrice }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
