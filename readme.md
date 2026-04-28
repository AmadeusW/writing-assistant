# Writing Assistant

Writing Assistant improves the choice of words, structure of sentences, flow of paragraphs.

## How it works

1. User has a main text input element and a few elements where writing assistant provides refined text.
2. Each of these elements can be in two modes: editing, or output
    - In output mode, writing assistant shows rewritten user's input
    - In edit mode, user sees an input area where they can tell writing assistant how to process their input
3. This way, user gets to customize writing assistant to their need
4. When user is finished typing (use debouncing), each of the elements makes a web request
    - The web requests are sequential, i.e. one at a time
    - The web request is made to `http://127.0.0.1:1234` endpoing `POST` `/api/v1/chat` (using OpenAI API)
    - The response will appeaer in the element in the output mode
5. The project is made as a simple website. Use basic HTML5 and minimal CSS style. Do not use unnecessary libraries.
