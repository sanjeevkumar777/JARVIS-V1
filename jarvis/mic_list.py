import speech_recognition as sr

print("Available microphones:\n")

for i, name in enumerate(sr.Microphone.list_microphone_names()):
    print(i, ":", name)