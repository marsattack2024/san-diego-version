### App Flow Documentation

**Home Page**
- The user lands on the home page, which provides an overview of the Marlan AI chatbot and its capabilities. This page introduces the user to the features of the chatbot, such as marketing assistance for photographers, and provides a call-to-action to sign up or log in.

**Authentication Page**
- From the home page, users can navigate to the authentication page where they can sign up or log in using their email. The authentication process is handled by Supabase Auth, which manages user sessions securely.

**Profile Setup Page**
- After logging in for the first time, users are redirected to the profile setup page. Here, they are prompted to fill in their business details, such as full name, company name, description, and location. Users can also provide their website URL for automatic content scraping and summary generation.

**Chat Interface**
- Once the profile is complete, users are directed to the chat interface. This is the main interaction page where users can select an agent type or use auto-detection to start a conversation. The chat interface supports streaming responses and displays real-time progress indicators for operations like web scraping and deep search.

**Agent Selection**
- Within the chat interface, users can manually select a specialized agent from a dropdown menu. The system also supports automatic agent selection based on keyword scoring and content analysis of the user's query.

**Admin Portal**
- Admin users have access to a separate portal for managing user profiles and monitoring system usage. This portal allows admins to create placeholder profiles, adjust rate limits, and view analytics.

**Navigation Flow**
- Users typically start at the home page and proceed to the authentication page. After logging in, they complete their profile on the profile setup page. Once their profile is set up, they are taken to the chat interface, where they can interact with the AI. Admin users can access the admin portal from the chat interface.
