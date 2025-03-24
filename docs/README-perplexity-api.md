Perplexity API
Chat Completions
Generates a model’s response for the given chat conversation.

POST
/
chat
/
completions

Try it
Authorizations
​
Authorization
stringheaderrequired
Bearer authentication header of the form Bearer <token>, where <token> is your auth token.

Body
application/json
​
model
stringrequired
The name of the model that will complete your prompt. Refer to Supported Models to find all the models offered.

Example:
"sonar"

​
messages
object[]required
A list of messages comprising the conversation so far.


Show child attributes

Example:
[
  {
    "role": "system",
    "content": "Be precise and concise."
  },
  {
    "role": "user",
    "content": "How many stars are there in our galaxy?"
  }
]
​
max_tokens
integer
The maximum number of completion tokens returned by the API.

​
temperature
numberdefault:0.2
The amount of randomness in the response, valued between 0 and 2.

Required range: 0 <= x < 2
​
top_p
numberdefault:0.9
The nucleus sampling threshold, valued between 0 and 1.

​
search_domain_filter
any[]
A list of domains to limit search results to.

​
return_images
booleandefault:false
Determines whether search results should include images.

​
return_related_questions
booleandefault:false
Determines whether related questions should be returned.

​
search_recency_filter
string
Filters search results based on time (e.g., 'week', 'day').

​
top_k
numberdefault:0
The number of tokens to keep for top-k filtering.

​
stream
booleandefault:false
Determines whether to stream the response incrementally.

​
presence_penalty
numberdefault:0
Positive values increase the likelihood of discussing new topics.

​
frequency_penalty
numberdefault:1
Decreases likelihood of repetition based on prior frequency.

​
response_format
object
Enables structured JSON output formatting.

​
web_search_options
object
Configuration for using web search in model responses.


Show child attributes

Example:
{ "search_context_size": "high" }
Response
200
application/json

application/json
OK
The response is of type any.

twitter
linkedin
discord
website

cURL

Python

JavaScript

PHP

Go

Java

Copy
const options = {
  method: 'POST',
  headers: {Authorization: 'Bearer <token>', 'Content-Type': 'application/json'},
  body: '{"model":"sonar","messages":[{"role":"system","content":"Be precise and concise."},{"role":"user","content":"How many stars are there in our galaxy?"}],"max_tokens":123,"temperature":0.2,"top_p":0.9,"search_domain_filter":["<any>"],"return_images":false,"return_related_questions":false,"search_recency_filter":"<string>","top_k":0,"stream":false,"presence_penalty":0,"frequency_penalty":1,"response_format":{},"web_search_options":{"search_context_size":"high"}}'
};

fetch('https://api.perplexity.ai/chat/completions', options)
  .then(response => response.json())
  .then(response => console.log(response))
  .catch(err => console.error(err));

200

Copy
"<any>"