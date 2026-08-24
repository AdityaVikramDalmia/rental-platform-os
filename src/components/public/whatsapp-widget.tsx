"use client";

import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_DEMORENTALS_WHATSAPP_PHONE ?? "";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Hi DemoRentals team, I am looking for a rental home. Can you help me with available options?",
);

export function WhatsAppWidget() {
  if (!WHATSAPP_PHONE) return null;

  return (
    <motion.a
      href={`https://wa.me/${WHATSAPP_PHONE}?text=${WHATSAPP_MESSAGE}`}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 2, type: "spring", stiffness: 200 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-500/30 transition-shadow hover:shadow-xl hover:shadow-emerald-500/40"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="size-6" />
      <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-20" />
    </motion.a>
  );
}
