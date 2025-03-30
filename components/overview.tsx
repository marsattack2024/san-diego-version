import { motion } from 'framer-motion';
import Link from 'next/link';

import { MessageIcon, VercelIcon } from './icons';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="w-full max-w-3xl mx-auto md:mt-20 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center mx-auto">
        <p className="flex flex-row justify-center gap-4 items-center">
          <VercelIcon size={32} />
          <span>+</span>
          <MessageIcon size={32} />
        </p>
        <p>
          This is a powerful{' '}
          <Link
            className="font-medium underline underline-offset-4"
            href="https://programs.thehighrollersclub.io/"
          >
            AI Agent
          </Link>{' '}
          chatbot built by Photography to Profits. It uses{' '}
          <code className="rounded-md bg-muted px-1 py-0.5">gpt-4o</code>{' '}
          model and{' '}
          <code className="rounded-md bg-muted px-1 py-0.5">Perplexity DeepSearch</code> API
          to create an accurate photography marketing agent with a knowledgebase, internet look up, and agent routing.
        </p>
        <p>
          You can learn more about the AI Bot by visiting{' '}
          <Link
            className="font-medium underline underline-offset-4"
            href="https://photographytoprofits.com/ai"
            target="_blank"
          >
            docs
          </Link>
          .
        </p>
      </div>
    </motion.div>
  );
};
