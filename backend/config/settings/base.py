from datetime import timedelta
from pathlib import Path
import ssl
import dj_database_url

import environ, os

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    ENABLE_SPECTACULAR=(bool, True),
    ACCESS_TOKEN_LIFETIME_SECONDS=(int, 1800),
    REFRESH_TOKEN_LIFETIME_SECONDS=(int, 604800),
)

environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("SECRET_KEY", default="unsafe-dev-secret-change-me")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", 
                         default=[
                             "localhost", 
                             "127.0.0.1", 
                             ".onrender.com",
                             "https://entercom-v1.onrender.com", 
                             "entercom-v1.onrender.com",
                             ".vercel.app",
                             "entercom-v1.vercel.app",
                             ])

ENABLE_SPECTACULAR = env.bool("ENABLE_SPECTACULAR", default=True)

LOCAL_APPS = [
    "apps.common",
    "apps.users",
    "apps.roles",
    "apps.authentication",
    "apps.requests",
    "apps.bookings",
    "apps.notification",

    "apps.chat",
    #"apps.ai_support",
    "apps.products",
    "apps.orders",
    "apps.payments",
    "apps.analytics",
    "apps.audit",
    "apps.audit_logs",
    #"apps.technicians",
    "apps.websocket",
]

THIRD_PARTY_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "channels",
    "drf_spectacular",
    # "django_extensions",
    "django_celery_beat",
]

INSTALLED_APPS = LOCAL_APPS + THIRD_PARTY_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.request_id.RequestIdMiddleware",
]


# --------------------------------------------------
# CORS / CSRF
# --------------------------------------------------

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    FRONTEND_URL,
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "https://*.onrender.com",
    "https://entercom-v1.onrender.com",
    FRONTEND_URL,
]


ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# DATABASES = {
#     "default": env.db(
#         "DATABASE_URL",
#         default="postgresql://postgres:password@localhost:5432/entercom"
#     )
# }

DATABASES = {
    'default': dj_database_url.config(
        default=os.environ.get(
            'DATABASE_URL',
            'postgresql://postgres:Supawale%400811@db.bthvlmwzjwryepeugwqw.supabase.co:5432/postgres'
        ),
        conn_max_age=0,
        conn_health_checks=True, # This ensures that Supabase's pooler handles the connections
        ssl_require= True,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = (
    "whitenoise.storage.CompressedManifestStaticFilesStorage"
)
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "users.User"

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[FRONTEND_URL, "http://localhost:5173", "http://127.0.0.1:5173"],
)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.authentication.authentication.CustomJWTAuthentication",
    ),
    "EXCEPTION_HANDLER": "core.drf_exception_handler.custom_exception_handler",
    "DEFAULT_PERMISSION_CLASSES": ("apps.roles.permissions.FailClosedPermission",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "user": "1000/hour",
        "auth": "30/minute",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        seconds=env.int("ACCESS_TOKEN_LIFETIME_SECONDS", default=1800)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        seconds=env.int("REFRESH_TOKEN_LIFETIME_SECONDS", default=604800)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Entercom Unified Platform API",
    "DESCRIPTION": "Modular monolith API — v1 foundation.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

if REDIS_URL:
    import ssl

    is_secure = REDIS_URL.startswith("rediss://")
    
    if is_secure:
        if "?" in REDIS_URL:
            REDIS_URL += "&ssl_cert_reqs=none"
        else:
            REDIS_URL += "?ssl_cert_reqs=none"

    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
                "capacity": 1500,
                "expiry": 10,
            },
        },
    }

    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "CONNECTION_POOL_KWARGS": {
                    "health_check_interval": 30,
                    "retry_on_timeout": True,
                },
            }
        }
    }

    # 3. Set the broker/backend to memory (to satisfy Celery's internal checks)
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL
    if is_secure:
        CELERY_BROKER_USE_SSL = {
            "ssl_cert_reqs": ssl.CERT_NONE, #I have to replace with proper certificate later
        }

        CELERY_REDIS_BACKEND_USE_SSL = {
            "ssl_cert_reqs": ssl.CERT_NONE,
        }
    CELERY_TASK_ALWAYS_EAGER = DEBUG
    CELERY_TASK_EAGER_PROPAGATES = DEBUG
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_TIMEZONE = TIME_ZONE
    CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
    CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

else:
    # Local dev fallback
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer"
        }
    }

    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache"
        }
    }

    # 3. Set the broker/backend to memory (to satisfy Celery's internal checks)
    CELERY_BROKER_URL = "memory://"
    CELERY_RESULT_BACKEND = "cache+memory://"
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
    CELERY_ACCEPT_CONTENT = ["json"]
    CELERY_TASK_SERIALIZER = "json"
    CELERY_RESULT_SERIALIZER = "json"
    CELERY_TIMEZONE = TIME_ZONE

# CHANNEL_LAYERS = {
#     "default": {
#         "BACKEND": "channels.layers.InMemoryChannelLayer",
#     }
# }


CELERY_BEAT_SCHEDULE = {
    "audit-retention-daily": {
        "task": "audit_logs.run_retention",
        "schedule": timedelta(days=1),
        "kwargs": {"dry_run": False},
    },
}






AUDIT_USE_SENTRY=True

AUDIT_ALERT_EMAILS=[
    # emails to get audit alerts
...
]

EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"

EMAIL_HOST = os.environ.get("EMAIL_HOST")
EMAIL_TIMEOUT = 60


RESEND_API_KEY = env("RESEND_API_KEY", default="")
RESEND_FROM_EMAIL = env("RESEND_FROM_EMAIL", default="")


SUPABASE_URL = env("SUPABASE_URL", default="")
SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY", default="")
SUPABASE_STORAGE_BUCKET = env("SUPABASE_STORAGE_BUCKET", default="")

PAYSTACK_SECRET_KEY = env("PAYSTACK_SECRET_KEY", default="sk_test_fake_secret")
PAYSTACK_PUBLIC_KEY = env("PAYSTACK_PUBLIC_KEY", default="pk_test_fake_public")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "%(asctime)s [%(levelname)s] %(name)s %(request_id)s %(message)s",
        },
    },
    "filters": {
        "request_id": {"()": "core.logging.RequestIdFilter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
            "filters": ["request_id"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.request": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}
