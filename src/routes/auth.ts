import { Router } from "express";
import { loginUser, refreshAccessToken } from "../controllers/auth";

const router = Router();

/**
 * @swagger
 * tags:
 *  name: Auth
 *  description: Authentication endpoints
 */

/**
 * @swagger
 * /auth/login:
 *  post:
 *    tags: [Auth]
 *    summary: Log in a user
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              email:
 *                type: string
 *                example: johndoe@gmail.com
 *              password:
 *                type: string
 *                example: examplepassword
 *    responses:
 *      200:
 *        description: Successfully logged in
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                token:
 *                  type: string
 *                user:
 *                  $ref: '#/components/schemas/User'
 *      400:
 *        description: Invalid credentials
 */
router.post("/login", loginUser);

/**
 * @swagger
 * /auth/refresh:
 *  post:
 *    tags: [Auth]
 *    summary: Refresh access token using HTTP-only cookie
 *    responses:
 *      200:
 *        description: Returns new access token
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                accessToken:
 *                  type: string
 *      401:
 *        description: Missing refresh token
 *      403:
 *        description: Invalid refresh token
 */
router.post("/refresh", refreshAccessToken);

export default router;
