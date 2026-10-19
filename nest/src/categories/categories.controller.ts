import { BadRequestException, Controller, Get, Param } from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { CategoriesValidation, FieldError } from "./categories.validation";

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
}
