-- MIGRATE createUsersTable
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE createPostsTable
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    published INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- TESTDATA insertTestUser
INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com');

-- EXEC insertUser
@set name = 'John'
@set email = 'john@example.com'
INSERT INTO users (name, email) VALUES (${name}, ${email});

-- QUERY getUsers
SELECT id, name, email, created_at FROM users;

-- QUERY getUserById :one
@set id = 1
SELECT id, name, email, created_at FROM users WHERE id = ${id};

-- QUERY getUserByEmail :one
@set email = 'test@example.com'
SELECT id, name, email, created_at FROM users WHERE email = ${email};

-- EXEC insertPost
@set userId = 1
@set title = 'Test Title'
@set content = 'Test Content'
@set published = 0
INSERT INTO posts (user_id, title, content, published)
VALUES (${userId}, ${title}, ${content}, ${published});

-- QUERY getPostsByUser
@set userId = 1
SELECT id, user_id, title, content, published, created_at
FROM posts WHERE user_id = ${userId};

-- QUERY getPublishedPosts
SELECT p.id, p.title, p.content, p.created_at, u.name as author_name
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.published = 1;

-- QUERY countUserPosts :one :pluck
@set userId = 1
SELECT COUNT(*) FROM posts WHERE user_id = ${userId};
