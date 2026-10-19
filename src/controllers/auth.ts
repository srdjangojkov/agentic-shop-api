import { Request, Response } from 'express';

import authService from '../services/auth';
import { handleHttpError } from '../utils/error.handle';
import { generateAccessToken, verifyRefreshToken } from '../utils/jwt.handle';

const loginUser = async ({ body }: Request, res: Response) => {
	try {
		const { name, email, password } = body;
		const user = await authService.loginUser({ email, password });

		if (user === 'INCORRECT_PASSWORD' || user === 'USER_NOT_FOUND') {
			return res.status(400).json({
				msg: 'User/Password incorrect',
			});
		}

		res.cookie('refreshToken', user.refreshToken, {
			httpOnly: true,
			secure: true,
			sameSite: 'strict',
			maxAge: 7 * 24 * 60 * 60 * 1000,
		});

		return res.json({
			accessToken: user.accessToken,
		});
	} catch (error) {
		handleHttpError(res, 'ERROR_LOGIN_USER', error);
	}
};

const refreshAccessToken = async (req: Request, res: Response) => {
	try {
		const refreshToken = req.cookies?.refreshToken;
    console.log(req.cookies);

		if (!refreshToken) {
			return res.status(401).json({ msg: 'Refresh token missing' });
		}

		const payload = verifyRefreshToken(refreshToken) as { id: string };

		const newAccessToken = await generateAccessToken(payload.id);

		return res.json({ accessToken: newAccessToken });
	} catch (error) {
		return res.status(403).json({ msg: 'Invalid refresh token' });
	}
};

export { loginUser, refreshAccessToken };
