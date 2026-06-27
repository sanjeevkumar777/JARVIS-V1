import speech_recognition as sr

print("Available Microphones:")
for i, name in enumerate(sr.Microphone.list_microphone_names()):
    print(f"{i}: {name}")

print("\nTesting microphones...\n")

for i in range(len(sr.Microphone.list_microphone_names())):
    try:
        print(f"Testing Mic {i}...")
        r = sr.Recognizer()

        with sr.Microphone(device_index=i) as source:
            r.adjust_for_ambient_noise(source, duration=1)
            print("Say: Hello")
            audio = r.listen(source, timeout=5, phrase_time_limit=3)

        text = r.recognize_google(audio)
        print(f"SUCCESS! Mic {i}: {text}")
        break

    except Exception as e:
        print(f"Mic {i} Error:", e)
        print("-" * 30)