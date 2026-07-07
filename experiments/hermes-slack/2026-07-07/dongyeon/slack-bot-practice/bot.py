from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

BOT_TOKEN = ""
APP_TOKEN = ""

app = App(token=BOT_TOKEN)

@app.event("app_mention")
def handle_mention(event, say):
    user = event["user"]
    text = event["text"]
    say(f"안녕하세요 <@{user}>님! '{text}' 라고 하셨네요.")

if __name__ == "__main__":
    SocketModeHandler(app, APP_TOKEN).start()