import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { CategoriesValidation, FieldError } from "./categories.validation";
import { Category } from "./category.schema";

// Validation failures respond 400 { errors: [...] } and other failures 400 { errors: "<CODE>" },
// as validateResult and handleHttpError do in Express (decisions.md, parity.md).
const rejectInvalid = (errors: FieldError[]) => {
  if (errors.length) throw new BadRequestException({ errors });
};

@Controller("categories")
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly validation: CategoriesValidation,
  ) {}

  @Get()
  async getCategories() {
    try {
      // The await runs the query inside the try, so a failure maps to the 400 below.
      return await this.categoriesService.getCategories();
    } catch {
      // Same error response as Express (decisions.md, 2026-10-19).
      throw new BadRequestException({ errors: "ERROR_GET_CATEGORIES" });
    }
  }

  @Get(":id")
  async getCategory(@Param("id") id: string) {
    rejectInvalid(await this.validation.validateId(id));
    try {
      return await this.categoriesService.getCategory(id);
    } catch {
      throw new BadRequestException({ errors: "ERROR_GET_CATEGORY" });
    }
  }

  @Post()
  async createCategory(@Body() body: { name?: unknown }) {
    rejectInvalid(await this.validation.validateCreate(body?.name));
    let category;
    try {
      category = await this.categoriesService.createCategory(body.name as string);
    } catch {
      throw new BadRequestException({ errors: "ERROR_CREATE_CATEGORY" });
    }
    if (category === "CATEGORY_ALREADY_EXISTS") {
      throw new BadRequestException({ msg: "CATEGORY_ALREADY_EXISTS" });
    }
    return category;
  }

  @Put(":id")
  async updateCategory(@Param("id") id: string, @Body() body: { name?: unknown; status?: unknown }) {
    rejectInvalid(await this.validation.validateUpdate(id, body?.name));
    const data: Partial<Record<keyof Category, unknown>> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.status !== undefined) data.status = body.status;
    try {
      return await this.categoriesService.updateCategory(id, data as Partial<Category>);
    } catch {
      throw new BadRequestException({ errors: "ERROR_UPDATE_CATEGORY" });
    }
  }

  @Delete(":id")
  async deleteCategory(@Param("id") id: string) {
    rejectInvalid(await this.validation.validateId(id));
    try {
      return await this.categoriesService.deleteCategory(id);
    } catch {
      throw new BadRequestException({ errors: "ERROR_DELETE_CATEGORY" });
    }
  }
}
