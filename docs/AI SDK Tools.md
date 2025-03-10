
Tools
Tools
While large language models (LLMs) have incredible generation capabilities, they struggle with discrete tasks (e.g. mathematics) and interacting with the outside world (e.g. getting the weather).

Tools are actions that an LLM can invoke. The results of these actions can be reported back to the LLM to be considered in the next response.

For example, when you ask an LLM for the "weather in London", and there is a weather tool available, it could call a tool with London as the argument. The tool would then fetch the weather data and return it to the LLM. The LLM can then use this information in its response.

What is a tool?
A tool is an object that can be called by the model to perform a specific task. You can use tools with generateText and streamText by passing one or more tools to the tools parameter.

A tool consists of three properties:

description: An optional description of the tool that can influence when the tool is picked.
parameters: A Zod schema or a JSON schema that defines the parameters. The schema is consumed by the LLM, and also used to validate the LLM tool calls.
execute: An optional async function that is called with the arguments from the tool call.
streamUI uses UI generator tools with a generate function that can return React components.

If the LLM decides to use a tool, it will generate a tool call. Tools with an execute function are run automatically when these calls are generated. The results of the tool calls are returned using tool result objects.

You can automatically pass tool results back to the LLM using multi-step calls with streamText and generateText.

Schemas
Schemas are used to define the parameters for tools and to validate the tool calls.

The AI SDK supports both raw JSON schemas (using the jsonSchema function) and Zod schemas (either directly or using the zodSchema function).

Zod is a popular TypeScript schema validation library. You can install it with:

pnpm
npm
yarn
pnpm add zod
You can then specify a Zod schema, for example:


import z from 'zod';

const recipeSchema = z.object({
  recipe: z.object({
    name: z.string(),
    ingredients: z.array(
      z.object({
        name: z.string(),
        amount: z.string(),
      }),
    ),
    steps: z.array(z.string()),
  }),
});
You can also use schemas for structured output generation with generateObject and streamObject.