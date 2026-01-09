-- MIGRATE createUsersTable
CREATE SEQUENCE IF NOT EXISTS seq_users_id START 1;
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY DEFAULT nextval('seq_users_id'),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp
);

-- MIGRATE createPostsTable
CREATE SEQUENCE IF NOT EXISTS seq_posts_id START 1;
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY DEFAULT nextval('seq_posts_id'),
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT,
    published BOOLEAN DEFAULT false,
    tags TEXT[],
    metadata STRUCT(views INTEGER, likes INTEGER, featured BOOLEAN),
    created_at TIMESTAMP DEFAULT current_timestamp
);

-- MIGRATE createTopics
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP
);
-- TABLE topics :appender

--QUERY getTopics
SELECT * from topics;

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
@set published = false
INSERT INTO posts (user_id, title, content, published, tags, metadata)
VALUES (${userId}, ${title}, ${content}, ${published}, ['general'], {'views': 0, 'likes': 0, 'featured': false});

-- QUERY getPostsByUser
@set userId = 1
SELECT id, user_id, title, content, published, tags, metadata, created_at
FROM posts WHERE user_id = ${userId};

-- QUERY getPublishedPosts
SELECT p.id, p.title, p.content, p.created_at, u.name as author_name
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.published = true;

-- QUERY countUserPosts :one :pluck
@set userId = 1
SELECT COUNT(*) FROM posts WHERE user_id = ${userId};
