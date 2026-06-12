# Bibliomaniacs

A web application built using a single React Native codebase (via React Native for Web). The application communicates with a Python Flask backend, uses Firebase for secure authentication and data storage, and integrates AI features powered by a large language model (LLM).

## Prerequisites
Make sure you have the following installed before getting started:

Node.js (v18 or higher recommended)
Python 3.9+
Expo CLI — npm install -g expo-cli
Redis (running locally or via a cloud provider)
A Firebase project with Firestore enabled


## Installation

### Clone the Repository
bashgit clone <your-repo-url>
cd plumbingproject
### Install Frontend Dependencies
bashnpm install
### Set Up the Python Backend
It's recommended to use a virtual environment:
bashcd backend
python3 -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
pip install -r requirements.txt
The backend depends on (at minimum):

flask
flask-cors
firebase-admin
fireo
reportlab
redis
better-profanity

If a requirements.txt is not present, install these manually:
bashpip install flask flask-cors firebase-admin fireo reportlab redis better-profanity
Configure Firebase

Go to your Firebase Console, open your project, and navigate to Project Settings → Service Accounts.
Click Generate new private key and download the JSON file.
Place it in the backend/ directory and rename it to serviceKey.json.

Alternatively, set it as an environment variable (recommended for production):
bashexport FIREBASE_SERVICE_KEY=$(cat path/to/serviceKey.json)
### Configure Redis
Make sure Redis is running on localhost:6379 (default), or update the connection settings in backend/cache.py to point to your Redis instance.
### Set Admin Emails
In backend/config.py, add the email addresses that should have admin access:
pythonADMIN_EMAILS = ["admin@example.com"]


## Running the App

Development (frontend + backend together)
From the project root:
bashnpm run dev
This runs the Flask backend and Expo dev server concurrently using concurrently.
Frontend Only
bashnpm run client     # Expo dev server
npm run web        # Browser
npm run android    # Android emulator/device
npm run ios        # iOS simulator/device
Backend Only
bashnpm run server
# or directly:
python3 backend/app.py

## Building for Production
Export the Expo app as a static web build:
bashnpm run build
Output will be in the dist/ directory.

Project Structure
PlumbingProjectApp/
├── app/
├── assets/
├── backend/
│   ├── recommendationModel/
│   │   ├── housedBooks/
│   │   ├── bigReviews.csv
│   │   ├── reviewedBooks.csv
│   │   ├── reviews2024.csv
│   │   ├── requirements.txt
│   │   └── *.py
│   ├── app.py
│   ├── cache.py
│   ├── cache_utils.py
│   ├── config.py
│   ├── data_loader.py
│   ├── email_utils.py
│   ├── firebaseConfig.js
│   ├── genre_images.py
│   └── serviceKey.json
├── .gitignore
└── package.json

## Environment Variables
HUGGINGFACEHUB_API_TOKEN=your_huggingface_token

EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
ADMIN_EMAILS=admin_emails

## Setup Notes

serviceKey.json contains sensitive credentials — never commit it to version control. Add it to .gitignore.

Redis must be running before starting the backend, as it is used for caching prompts and responses.

The recommendation model (commented out in app.py) is not active in the current build.

Admin emails in .env should each be separated by a space, no commas


## Tech Stack Overview

#### Frontend

React Native (with React Native for Web) – Core UI framework for building apps from a single codebase, running on web browsers via React Native for Web (extension layer).
Expo – Provides build tools, device testing, and development environment
Tailwind CSS – Utility-first styling for fast and responsive UI design
Axios – Used for making HTTPS API requests to the backend

#### Backend

Python Flask – Lightweight server that exposes REST API endpoints
Communicates with the frontend via JSON-based API calls

#### Authentication & Database

Firebase Authentication
- Supports federated identity providers such as Google Sign-In
- Tokens are verified server-side using Firebase Admin SDK

Cloud Firestore (Firebase)
- NoSQL document-based database
- Stores application data (users, roles, books, etc.)

#### ORM / Data Layer

FireORM – Used to manage Firestore data with an object-model interface

#### AI / Caching

Redis – Used for caching responses and improving AI/LLM request performance
LLM Model Used: Mistral-7B-Instruct-v0.2
- Hosted on Hugging Face: https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.2

#### PDF Generation

jsPDF – React library used for exporting and generating PDF documents
