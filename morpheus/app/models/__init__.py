from app.models.user import User
from app.models.chat import ChatSession, ChatMessage
from app.models.notes import Note, Task, CalendarEvent
from app.models.email import EmailAccount, EmailMessage
from app.models.ssh import SSHProfile
from app.models.auth import ApiToken
from app.models.memory import MemoryVector, Skill
from app.models.vault import VaultItem
from app.models.settings import UserSetting
from app.models.system_setting import SystemSetting
from app.models.obsidian import ObsidianNote

all_models = [
    User, ChatSession, ChatMessage, Note, Task, CalendarEvent,
    EmailAccount, EmailMessage, SSHProfile, ApiToken,
    MemoryVector, Skill, VaultItem, UserSetting, SystemSetting,
    ObsidianNote,
]
