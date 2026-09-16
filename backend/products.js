const whatsappPrice = Number(process.env.WHATSAPP_PRICE || '7.90');
if (!Number.isFinite(whatsappPrice) || whatsappPrice <= 0 || Math.round(whatsappPrice * 100) / 100 !== whatsappPrice) throw new Error('Invalid WHATSAPP_PRICE');
const products = {
  whatsapp_unlock: { id: 'whatsapp_unlock', name: 'Contato privado', price: whatsappPrice, type: 'one_time', get enabled() { return /^\d{10,15}$/.test((process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '')); } },
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
    price: 29.90,
    accessDays: 180
  }
};

module.exports = products;
