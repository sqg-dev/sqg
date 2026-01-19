-- MIGRATE 1
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    age INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE 2
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    views INTEGER DEFAULT 0,
    published INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- MIGRATE 3
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published);

-- EXEC insertUser
@set id = 1
@set name = 'John'
@set email = 'john@example.com'
@set age = 30
INSERT INTO users (id, name, email, age) VALUES (${id}, ${name}, ${email}, ${age});

-- QUERY getAllUsers
SELECT id, name, email, age, created_at FROM users;

-- QUERY getUserById :one
@set id = 1
SELECT id, name, email, age, created_at FROM users WHERE id = ${id};

-- QUERY getUserByEmail :one
@set email = 'test@example.com'
SELECT id, name, email, age, created_at FROM users WHERE email = ${email};

-- QUERY countUsers :one :pluck
SELECT COUNT(*) FROM users;

-- EXEC insertPost
@set userId = 1
@set title = 'Test Title'
@set content = 'Test Content'
@set published = 0
INSERT INTO posts (user_id, title, content, published)
VALUES (${userId}, ${title}, ${content}, ${published});

-- QUERY getPostsByUser
@set userId = 1
SELECT id, user_id, title, content, views, published, created_at
FROM posts WHERE user_id = ${userId};

-- QUERY getPublishedPosts
@set limit = 100
SELECT p.id, p.title, p.content, p.views, p.created_at, u.name as author_name
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.published = 1
ORDER BY p.created_at DESC limit ${limit};

-- QUERY getPostWithAuthor :one
@set postId = 1
SELECT p.id, p.title, p.content, p.views, p.created_at,
       u.id as author_id, u.name as author_name, u.email as author_email
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.id = ${postId};

-- QUERY countPostsByUser :one :pluck
@set userId = 1
SELECT COUNT(*) FROM posts WHERE user_id = ${userId};

-- EXEC updatePostViews
@set postId = 1
@set views = 100
UPDATE posts SET views = ${views} WHERE id = ${postId};

-- EXEC deletePost
@set postId = 1
DELETE FROM posts WHERE id = ${postId};
