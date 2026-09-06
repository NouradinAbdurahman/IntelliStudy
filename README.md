![Cover Image](https://i.ibb.co/39gDS6Fq/INTELLSTUDY.png)
# IntelliStudy - AI Tools for Students (Using OpenRouter API)

IntelliStudy is an AI-powered learning platform designed to enhance the educational experience for students of all levels. This project leverages advanced AI capabilities to provide practical tools that help with common academic tasks, making learning more efficient and accessible.

## Project Overview

IntelliStudy aims to democratize access to cutting-edge AI tools specifically tailored for educational purposes. In an increasingly digital learning environment, students often face challenges with information overload, time management, and effective study strategies. IntelliStudy addresses these challenges by providing a suite of specialized tools.

### Core Philosophy

The platform is built on three key principles:
- **Accessibility**: Making advanced AI tools available to all students regardless of technical background
- **Efficiency**: Helping students save time on routine tasks to focus on deeper understanding
- **Enhancement**: Augmenting learning capabilities rather than replacing traditional study methods

## Features

- **Text Summarization**: Transform lengthy academic papers, articles, and study materials into concise, digestible summaries while preserving key information and main arguments.

- **Content Rewriter**: Paraphrase texts to improve clarity, avoid plagiarism, and enhance your writing style. Perfect for refining essays, research papers, and notes.

- **AI Chatbot**: Engage with an intelligent assistant that can answer questions, explain concepts, provide examples, and help troubleshoot academic problems across various subjects.

- **Quiz Generator**: Create customized practice tests and quizzes on any topic to reinforce learning and prepare for exams. Set difficulty levels and receive immediate feedback.

## Technology Stack

IntelliStudy is built using modern web technologies:

- **Frontend**: Next.js, React, TailwindCSS
- **UI Components**: Shadcn UI
- **AI Integration**: Advanced language models via the OpenRouter API, with automatic fallback across multiple free models so the app keeps responding even if one model is unavailable
- **Responsive Design**: Fully optimized for all devices from mobile to desktop

## Environment Variables

This project uses environment variables to store API keys securely. Before running the project:

1. Create a `.env` file in the root directory
2. Get your OpenRouter API Key from the [OpenRouter dashboard](https://openrouter.ai/settings/keys)
3. Add your API key as shown in `.env.example`:
   ```
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```
4. Never commit your actual `.env` file to version control

## Getting Started

First, install the dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Use

### Text Summarization

1. Navigate to the Summarization tool
2. Paste the text you want to summarize
3. Click "Summarize" and get a concise version of your content

### Content Rewriter

1. Go to the Rewriter tool
2. Enter the text you want to rewrite
3. Select your desired writing style
4. Submit and receive your rewritten content

### AI Chatbot

1. Access the Chat tool
2. Type your question or topic
3. Engage in a conversation with the AI assistant

### Quiz Generator

1. Visit the Quiz Generator tool
2. Enter the topic you want to be quizzed on
3. Select difficulty level and number of questions
4. Generate and take your customized quiz

## Future Development Plans

IntelliStudy is continuously evolving with several features planned for future releases:

- **Collaborative Study Rooms**: Create virtual study spaces where students can share resources and learn together
- **Citation Generator**: Automatically format citations in various academic styles
- **Language Translation**: Translate study materials between multiple languages
- **Personalized Learning Paths**: AI-recommended study materials based on individual learning patterns

## Creator

This project was created by **Nouraddin Abdurahman Aden**, a passionate developer focused on building innovative AI-powered educational tools. With a deep interest in creating technology that enhances learning experiences, Nouraddin developed IntelliStudy to bridge the gap between advanced AI capabilities and everyday student needs.

- GitHub: [github.com/NouradinAbdurahman](https://github.com/NouradinAbdurahman)
- LinkedIn: [linkedin.com/in/nouraddin](https://www.linkedin.com/in/nouraddin/)
- Instagram: [@nouradiin_](https://www.instagram.com/nouradiin_/)
- Email: [n.aden1208@gmil.com](mailto:n.aden1208@gmil.com)

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- Thanks to all the open source libraries that made this project possible
- Special appreciation to the educational community for providing valuable feedback

For questions, collaborations, or feedback about IntelliStudy, feel free to reach out!

---
