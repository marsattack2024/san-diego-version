
Overview
Overview
This page is a beginner-friendly introduction to high-level artificial intelligence (AI) concepts. To dive right into implementing the AI SDK, feel free to skip ahead to our quickstarts or learn about our supported models and providers.

The AI SDK standardizes integrating artificial intelligence (AI) models across supported providers. This enables developers to focus on building great AI applications, not waste time on technical details.

For example, here’s how you can generate text with various models using the AI SDK:

OpenAI
Anthropic
Google
Mistral
Custom
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
const { text } = await generateText({
model: openai("o3-mini"),
prompt: "What is love?"
})
Love is a complex and multifaceted emotion that can be felt and expressed in many different ways. It involves deep affection, care, compassion, and connection towards another person or thing. Love can take on various forms such as romantic love, platonic love, familial love, or self-love.
To effectively leverage the AI SDK, it helps to familiarize yourself with the following concepts:

Generative Artificial Intelligence
Generative artificial intelligence refers to models that predict and generate various types of outputs (such as text, images, or audio) based on what’s statistically likely, pulling from patterns they’ve learned from their training data. For example:

Given a photo, a generative model can generate a caption.
Given an audio file, a generative model can generate a transcription.
Given a text description, a generative model can generate an image.
Large Language Models
A large language model (LLM) is a subset of generative models focused primarily on text. An LLM takes a sequence of words as input and aims to predict the most likely sequence to follow. It assigns probabilities to potential next sequences and then selects one. The model continues to generate sequences until it meets a specified stopping criterion.

LLMs learn by training on massive collections of written text, which means they will be better suited to some use cases than others. For example, a model trained on GitHub data would understand the probabilities of sequences in source code particularly well.

However, it's crucial to understand LLMs' limitations. When asked about less known or absent information, like the birthday of a personal relative, LLMs might "hallucinate" or make up information. It's essential to consider how well-represented the information you need is in the model.

Embedding Models
An embedding model is used to convert complex data (like words or images) into a dense vector (a list of numbers) representation, known as an embedding. Unlike generative models, embedding models do not generate new text or data. Instead, they provide representations of semantic and syntactic relationships between entities that can be used as input for other models or other natural language processing tasks.

In the next section, you will learn about the difference between models providers and models, and which ones are available in the AI SDK.