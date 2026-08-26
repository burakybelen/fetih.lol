// Bir kerelik yardımcı fonksiyon: Store ID, Product ID ve Variant ID'lerini görmek için.
// Deploy sonrası tarayıcıdan şu adrese git: https://SITEN.netlify.app/.netlify/functions/list-store-info
// Çıkan JSON'daki store id ve "Pay what you want" ürününün variant id'sini bana ver.

exports.handler = async function () {
  const API_KEY = process.env.LEMONSQUEEZY_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "LEMONSQUEEZY_API_KEY env var eksik. Netlify > Site settings > Environment variables kısmından ekle." }) };
  }

  const headers = {
    "Accept": "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    "Authorization": `Bearer ${API_KEY}`
  };

  try {
    const storesRes = await fetch("https://api.lemonsqueezy.com/v1/stores", { headers });
    const stores = await storesRes.json();

    const productsRes = await fetch("https://api.lemonsqueezy.com/v1/products?include=variants", { headers });
    const products = await productsRes.json();

    const simplifiedStores = (stores.data || []).map(s => ({
      store_id: s.id,
      name: s.attributes.name,
      store_url: s.attributes.url
    }));

    const variantsById = {};
    (products.included || []).filter(i => i.type === "variants").forEach(v => {
      variantsById[v.id] = v;
    });

    const simplifiedProducts = (products.data || []).map(p => ({
      product_id: p.id,
      name: p.attributes.name,
      store_id: p.attributes.store_id,
      variants: (p.relationships.variants.data || []).map(vRef => {
        const v = variantsById[vRef.id];
        return v ? {
          variant_id: v.id,
          name: v.attributes.name,
          pay_what_you_want: v.attributes.pay_what_you_want
        } : { variant_id: vRef.id };
      })
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ stores: simplifiedStores, products: simplifiedProducts }, null, 2)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
