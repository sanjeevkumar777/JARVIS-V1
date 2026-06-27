import speech_recognition as sr
import pyttsx3
import pywhatkit
import webbrowser
import datetime

# Initialize speech engine
engine = pyttsx3.init()
engine.setProperty('rate', 170)

def speak(text):
    print("Jarvis:", text)
    engine.say(text)
    engine.runAndWait()

def take_command():
    listener = sr.Recognizer()

    try:
        # device_index=1 is your default mic
        with sr.Microphone(device_index=1) as source:
            print("\n🎤 Speak now...")
            listener.adjust_for_ambient_noise(source, duration=2)

            audio = listener.listen(
                source,
                timeout=10,
                phrase_time_limit=5
            )

        print("🔍 Recognizing...")

        command = listener.recognize_google(audio)
        command = command.lower()

        print("You:", command)
        return command

    except sr.WaitTimeoutError:
        print("❌ No speech detected")
        return ""

    except sr.UnknownValueError:
        print("❌ Could not understand")
        return ""

    except sr.RequestError:
        print("❌ Internet error")
        return ""

    except Exception as e:
        print("❌ Error:", e)
        return ""


# Welcome
speak("Hello Sanjeev. I am Jarvis.")

while True:

    command = take_command()

    if command == "":
        continue

    # Greeting
    if "hello" in command:
        speak("Hello Sanjeev")

    # Time
    elif "time" in command:
        current = datetime.datetime.now().strftime("%I:%M %p")
        speak("Current time is " + current)

    # Date
    elif "date" in command:
        today = datetime.datetime.now().strftime("%d %B %Y")
        speak("Today's date is " + today)

    # Open YouTube
    elif "youtube" in command:
        speak("Opening YouTube")
        webbrowser.open("https://www.youtube.com")

    # Open Google
    elif "google" in command:
        speak("Opening Google")
        webbrowser.open("https://www.google.com")

    # Search Google
    elif "search" in command:
        query = command.replace("search", "").strip()

        if query:
            speak("Searching " + query)
            pywhatkit.search(query)

    # Play on YouTube
    elif "play" in command:
        song = command.replace("play", "").strip()

        if song:
            speak("Playing " + song)
            pywhatkit.playonyt(song)

    # Calculator
    elif "calculator" in command:
        speak("Opening calculator")
        import os
        os.system("calc")

    # Notepad
    elif "notepad" in command:
        speak("Opening notepad")
        import os
        os.system("notepad")

    # Exit
    elif "exit" in command or "stop" in command or "bye" in command:
        speak("Goodbye Sanjeev")
        break

    # Unknown command
    else:
        speak("Sorry. I did not understand.")