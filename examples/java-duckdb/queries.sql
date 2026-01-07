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
    created_at TIMESTAMP DEFAULT current_timestamp
);

-- EXEC insertUser
@set name = 'John'
@set email = 'john@example.com'
INSERT INTO users (name, email) VALUES (${name}, ${email});

-- QUERY getUsers
SELECT id, name, email, created_at FROM users;

-- QUERY getUserById :one
@set id = 1
SELECT id, name, email, created_at FROM users WHERE id = ${id};

-- QUERY countUsers :one :pluck
SELECT COUNT(*) FROM users;

-- EXEC insertPost
@set userId = 1
@set title = 'Hello World'
@set content = 'My first post'
@set published = false
INSERT INTO posts (user_id, title, content, published, tags)
VALUES (${userId}, ${title}, ${content}, ${published}, ['general']);

-- QUERY getPostsByUser
@set userId = 1
SELECT id, user_id, title, content, published, tags, created_at
FROM posts WHERE user_id = ${userId};

-- QUERY getPublishedPosts
SELECT p.id, p.title, p.content, p.created_at, u.name as author_name
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.published = true;
