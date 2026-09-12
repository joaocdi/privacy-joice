const whatsappPrice = Number(process.env.WHATSAPP_PRICE || '8.90');
if (!Number.isFinite(whatsappPrice) || whatsappPrice <= 0 || Math.round(whatsappPrice * 100) / 100 !== whatsappPrice) throw new Error('Invalid WHATSAPP_PRICE');
const products = {
  whatsapp_unlock: { id: 'whatsapp_unlock', name: 'Contato privado', price: whatsappPrice, type: 'one_time', enabled: false },
  monthly: {
    id: "monthly",
    name: "1 mês",
    price: 9.90,
    accessDays: 30
  },

  quarterly: {
    id: "quarterly",
    name: "3 meses",
    price: 19.90,
    accessDays: 90
  },

  semester: {
    id: "semester",
    name: "6 meses",
    price: 39.90,
    accessDays: 180
  }
};

module.exports = products;
